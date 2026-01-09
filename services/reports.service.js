// reports.service.js — PDF generation using HTML-to-PDF (matching React Native format)
const puppeteer = require('puppeteer');
const clientService = require("./client.service");
const userService = require("./user.service");
const { generatePresignedUrl } = require('../utils/s3');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

async function buildEnquiryPdf(rows = []) {
  const startTime = Date.now();
  console.log(`[PDF] Starting PDF generation for ${rows.length} enquiries`);
  
  // ---- Fetch all clients and users (cached, lightweight, <50 records) ----
  console.log(`[PDF] Fetching clients and users...`);
  
  // Get all clients (returns Name and _id, cached)
  const clients = await clientService.getClients();
  const clientsMap = clients.reduce((acc, c) => {
    acc[c._id.toString()] = c.Name;
    return acc;
  }, {});
  
  // Get all users (returns name and _id, cached)
  const users = await userService.getUsers();
  const usersMap = users.reduce((acc, u) => {
    acc[u._id.toString()] = u.name; // User model uses lowercase 'name'
    return acc;
  }, {});
  
  const lookupTime = Date.now() - startTime;
  console.log(`[PDF] Lookups completed in ${lookupTime}ms`);

  // Format date helper (matching React Native format)
  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (error) {
      return 'N/A';
    }
  };
  
  // Format metal helper (e.g., "Gold (10K)" or "Yellow Gold (18K)")
  const formatMetal = (metal) => {
    if (!metal) return '';
    const color = metal.Color || '';
    const quality = metal.Quality || '';
    if (color && quality) {
      return `${color} (${quality})`;
    }
    return color || quality || '';
  };

  // Get status color (matching React Native)
  const getStatusColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'pending') return '#FFA500';
    if (statusLower === 'completed') return '#4CAF50';
    if (statusLower === 'rejected') return '#F44336';
    return '#9CA3AF';
  };

  // Get priority color (matching React Native)
  const getPriorityColor = (priority) => {
    const priorityLower = (priority || '').toLowerCase();
    if (priorityLower === 'high' || priorityLower === 'urgent' || priorityLower.includes('super')) return '#F44336';
    if (priorityLower === 'medium') return '#FF9800';
    if (priorityLower === 'low') return '#4CAF50';
    return '#9CA3AF';
  };

  // Escape HTML helper
  const escapeHtml = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Fetch image, resize/compress, and convert to base64 (optimized for PDF)
  const fetchImageAsBase64 = async (imageKey) => {
    if (!imageKey) return '';
    
    try {
      // Generate presigned URL
      const presignedUrl = await generatePresignedUrl(imageKey, 'inline');
      
      // Fetch image
      return new Promise((resolve) => {
        const url = new URL(presignedUrl);
        const client = url.protocol === 'https:' ? https : http;
        
        client.get(presignedUrl, async (response) => {
          if (response.statusCode !== 200) {
            console.warn(`[PDF] Failed to fetch image ${imageKey}: ${response.statusCode}`);
            resolve('');
            return;
          }
          
          const chunks = [];
          let totalSize = 0;
          const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit before processing
          
          response.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize > MAX_IMAGE_SIZE) {
              response.destroy();
              console.warn(`[PDF] Image ${imageKey} too large (${(totalSize/1024/1024).toFixed(1)}MB), skipping`);
              resolve('');
              return;
            }
            chunks.push(chunk);
          });
          
          response.on('end', async () => {
            try {
              const buffer = Buffer.concat(chunks);
              const contentType = response.headers['content-type'] || '';
              
              // Skip non-image files (videos, documents, etc.)
              if (!contentType.startsWith('image/')) {
                console.warn(`[PDF] Skipping non-image file ${imageKey} (${contentType})`);
                resolve('');
                return;
              }
              
              // Resize and compress image for PDF (80x80px thumbnail, optimized)
              const optimizedBuffer = await sharp(buffer)
                .resize(80, 80, {
                  fit: 'cover',
                  withoutEnlargement: true
                })
                .jpeg({ 
                  quality: 70,
                  progressive: true
                })
                .toBuffer();
              
              const base64 = optimizedBuffer.toString('base64');
              const dataUrl = `data:image/jpeg;base64,${base64}`;
              resolve(dataUrl);
            } catch (error) {
              // If Sharp fails (unsupported format), skip the image
              console.warn(`[PDF] Error processing image ${imageKey}:`, error.message);
              resolve('');
            }
          });
          
          response.on('error', (error) => {
            console.warn(`[PDF] Error fetching image ${imageKey}:`, error.message);
            resolve('');
          });
        }).on('error', (error) => {
          console.warn(`[PDF] Error fetching image ${imageKey}:`, error.message);
          resolve('');
        });
      });
    } catch (error) {
      console.warn(`[PDF] Error generating presigned URL for ${imageKey}:`, error.message);
      return '';
    }
  };

  // Get last image URL from ReferenceImages
  const getLastImageKey = (enquiry) => {
    if (!enquiry || !enquiry.ReferenceImages || !Array.isArray(enquiry.ReferenceImages)) {
      return null;
    }
    
    // Get the last image (most recent)
    const lastImage = enquiry.ReferenceImages[enquiry.ReferenceImages.length - 1];
    if (!lastImage) return null;
    
    // Handle different image object structures
    return lastImage.Key || lastImage.key || lastImage.KeyName || lastImage.keyName || null;
  };

  // Fetch all images in parallel - always use optimized base64 (resized/compressed)
  // This ensures PDF size stays manageable even with many images
  const imageFetchStartTime = Date.now();
  console.log(`[PDF] Fetching and optimizing last images for ${rows.length} enquiries...`);
  
  const imagePromises = rows.map(async (r) => {
    const imageKey = getLastImageKey(r);
    if (!imageKey) return '';
    return await fetchImageAsBase64(imageKey);
  });
  
  const imageUrls = await Promise.all(imagePromises);
  const imageFetchTime = Date.now() - imageFetchStartTime;
  const imagesFound = imageUrls.filter(img => img !== '').length;
  console.log(`[PDF] Processed ${imagesFound} optimized images in ${imageFetchTime}ms`);

  // Generate HTML matching React Native format
  const htmlStartTime = Date.now();
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enquiries List - ${rows.length} Enquiries</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', sans-serif;
      padding: 20px;
      color: #333;
      background: #fff;
      font-size: 10px;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #1976D2;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #1976D2;
      font-size: 24px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #666;
      font-size: 12px;
    }
    .summary {
      margin-bottom: 20px;
      padding: 12px;
      background: #f5f5f5;
      border-radius: 8px;
      font-size: 11px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 9px;
    }
    thead {
      background-color: #1976D2;
      color: white;
    }
    th {
      padding: 8px 4px;
      text-align: left;
      font-weight: bold;
      border: 1px solid #1565C0;
      font-size: 9px;
    }
    td {
      padding: 6px 4px;
      border: 1px solid #e0e0e0;
      font-size: 8px;
      vertical-align: top;
    }
    tbody tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    tbody tr:hover {
      background-color: #f0f0f0;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 7px;
      font-weight: bold;
      text-transform: uppercase;
      color: white;
    }
    .status-badge {
      background-color: #9CA3AF;
    }
    .priority-badge {
      background-color: #9CA3AF;
    }
    .image-cell {
      text-align: center;
      width: 50px;
    }
    .enquiry-image {
      max-width: 40px;
      max-height: 40px;
      border-radius: 4px;
      object-fit: cover;
    }
    .text-truncate {
      max-width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #e0e0e0;
      text-align: center;
      color: #666;
      font-size: 9px;
    }
    @media print {
      body {
        padding: 10px;
      }
      table {
        page-break-inside: auto;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
      tfoot {
        display: table-footer-group;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>CHANDRA JEWELLERY</h1>
    <div class="subtitle">Enquiries List Report</div>
  </div>

  <div class="summary">
    <strong>Total Enquiries:</strong> ${rows.length} | 
    <strong>Generated:</strong> ${formatDate(new Date().toISOString())}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 3%;">#</th>
        <th style="width: 12%;">Name</th>
        <th style="width: 8%;">Category</th>
        <th style="width: 8%;">Status</th>
        <th style="width: 8%;">Client</th>
        <th style="width: 5%;">Image</th>
        <th style="width: 8%;">Assigned To</th>
        <th style="width: 8%;">Assigned Date</th>
        <th style="width: 8%;">Created Date</th>
        <th style="width: 8%;">Priority</th>
        <th style="width: 12%;">Metal</th>
        <th style="width: 8%;">Stone Type</th>
        <th style="width: 8%;">Shipping Date</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, index) => {
        const status = (r.CurrentStatus || 'pending').toString().toUpperCase();
        const statusColor = getStatusColor(r.CurrentStatus);
        const priority = (r.Priority || 'medium').toString().toUpperCase();
        const priorityColor = getPriorityColor(r.Priority);
        const imageUrl = imageUrls[index] || '';
        
        return `
        <tr>
          <td>${index + 1}</td>
          <td class="text-truncate">${escapeHtml(r.Name || '')}</td>
          <td>${escapeHtml(r.Category || 'N/A')}</td>
          <td>
            <span class="badge status-badge" style="background-color: ${statusColor}">${escapeHtml(status)}</span>
          </td>
          <td>${escapeHtml(clientsMap[r.ClientId?.toString()] || 'N/A')}</td>
          <td class="image-cell">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Enquiry Image" class="enquiry-image" />` : '-'}
          </td>
          <td>${escapeHtml(usersMap[r.AssignedTo?.toString()] || 'N/A')}</td>
          <td>${formatDate(r.AssignedDate)}</td>
          <td>${formatDate(r.CreatedDate)}</td>
          <td>
            <span class="badge priority-badge" style="background-color: ${priorityColor}">${escapeHtml(priority)}</span>
          </td>
          <td class="text-truncate">${escapeHtml(formatMetal(r.Metal))}</td>
          <td>${escapeHtml(r.StoneType || 'N/A')}</td>
          <td>${r.ShippingDate ? formatDate(r.ShippingDate) : 'Not set'}</td>
        </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated on ${formatDate(new Date().toISOString())}</p>
    <p>Chandra Jewellery - Enquiry Management System</p>
    <p>Total Records: ${rows.length}</p>
  </div>
</body>
</html>
  `;

  const htmlGenTime = Date.now() - htmlStartTime;
  console.log(`[PDF] HTML generated in ${htmlGenTime}ms`);

  // ---- Convert HTML to PDF using Puppeteer ----
  const pdfStartTime = Date.now();
  console.log(`[PDF] Converting HTML to PDF using Puppeteer...`);

  let browser;
  try {
    // Puppeteer launch configuration
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-gpu', // Disable GPU hardware acceleration
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--max-old-space-size=4096' // Increase memory limit
      ],
      timeout: 120000 // 120 second timeout for large PDFs
    };
    // if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    //   launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    //   console.log(`[PDF] Using Chrome from PUPPETEER_EXECUTABLE_PATH: ${launchOptions.executablePath}`);
    // }

    browser = await puppeteer.launch(launchOptions);
    console.log('[PDF] Puppeteer launched successfully');
    
    const page = await browser.newPage();
    
    // Set viewport for better rendering
    await page.setViewport({
      width: 1920,
      height: 1080
    });
    
    // Set content - use 'load' since images are base64 embedded
    await page.setContent(html, { 
      waitUntil: 'load',
      timeout: 120000 // 120 seconds for large HTML with many images
    });
    
    // Wait for images to render (using Promise instead of deprecated waitForTimeout)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      },
      printBackground: true,
      preferCSSPageSize: false
    });
    
    await page.close();
    await browser.close();
    
    const pdfGenTime = Date.now() - pdfStartTime;
    const totalTime = Date.now() - startTime;
    console.log(`[PDF] PDF generated in ${pdfGenTime}ms (${(pdfGenTime / 1000).toFixed(2)}s)`);
    console.log(`[PDF] Total PDF generation time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`[PDF] PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    
    return pdfBuffer;
  } catch (error) {
    console.error('[PDF] Error generating PDF with Puppeteer:', error);
    // Ensure browser is closed even on error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn('[PDF] Error closing browser:', closeError.message);
      }
    }
    throw error;
  }
}

module.exports = {
  buildEnquiryPdf
};
