'use strict';

const pdfMake = require('pdfmake/build/pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');
const clientService = require('./client.service');
const userService = require('./user.service');
const { generatePresignedUrl } = require('../utils/s3');
const https = require('https');
const http = require('http');
const sharp = require('sharp');

pdfMake.vfs = vfsFonts;

// ---- Constants ----

const COLORS = {
  primary:     '#1976D2',
  primaryDark: '#1565C0',
  headerText:  '#ffffff',
  rowAlt:      '#f9f9f9',
  border:      '#e0e0e0',
  muted:       '#666666',
  fallback:    '#9CA3AF',
};

const STATUS_COLORS = {
  pending:   '#FFA500',
  completed: '#4CAF50',
  rejected:  '#F44336',
};

const PRIORITY_COLORS = {
  low:    '#4CAF50',
  medium: '#FF9800',
  high:   '#F44336',
  urgent: '#F44336',
};

const TABLE_WIDTHS = [18, '*', 52, 52, 60, 42, 60, 52, 52, 52, 72, 52, 52];

const TABLE_HEADERS = [
  '#', 'Name', 'Category', 'Status', 'Client', 'Image',
  'Assigned To', 'Assigned Date', 'Created Date', 'Priority',
  'Metal', 'Stone Type', 'Shipping Date',
];

// ---- Helpers ----

const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
};

const formatMetal = (metal) => {
  if (!metal) return '';
  const color   = metal.Color   || '';
  const quality = metal.Quality || '';
  if (color && quality) return `${color} (${quality})`;
  return color || quality;
};

const statusColor = (status) =>
  STATUS_COLORS[(status || '').toLowerCase()] || COLORS.fallback;

const priorityColor = (priority) => {
  const p = (priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high' || p.includes('super')) return PRIORITY_COLORS.high;
  return PRIORITY_COLORS[p] || COLORS.fallback;
};

// ---- pdfmake cell builders ----

const cell = (text, extra = {}) => ({
  text: String(text ?? ''),
  fontSize: 7,
  margin: [2, 3, 2, 3],
  ...extra,
});

const badge = (text, color) => ({
  table: {
    widths: ['*'],
    body: [[{
      text: (text || '').toUpperCase(),
      fontSize: 6,
      bold: true,
      color: '#ffffff',
      fillColor: color,
      alignment: 'center',
      margin: [2, 1, 2, 1],
    }]],
  },
  layout: 'noBorders',
  margin: [0, 1, 0, 1],
});

const imageCell = (dataUrl) =>
  dataUrl
    ? { image: dataUrl, width: 32, height: 32, alignment: 'center', margin: [0, 1, 0, 1] }
    : cell('–', { alignment: 'center', color: '#999999' });

// ---- Image fetching ----

const getLastImageKey = (enquiry) => {
  const images = enquiry?.ReferenceImages;
  if (!Array.isArray(images) || images.length === 0) return null;
  const last = images[images.length - 1];
  return last?.Key || last?.key || last?.KeyName || last?.keyName || null;
};

const fetchImageAsBase64 = async (imageKey) => {
  if (!imageKey) return '';

  let presignedUrl;
  try {
    presignedUrl = await generatePresignedUrl(imageKey, 'inline');
  } catch {
    console.warn(`[PDF] Failed to get presigned URL for ${imageKey}`);
    return '';
  }

  return new Promise((resolve) => {
    const url    = new URL(presignedUrl);
    const client = url.protocol === 'https:' ? https : http;

    client.get(presignedUrl, async (response) => {
      if (response.statusCode !== 200) {
        console.warn(`[PDF] Image ${imageKey} responded ${response.statusCode}`);
        resolve('');
        return;
      }

      const contentType = response.headers['content-type'] || '';
      if (!contentType.startsWith('image/')) {
        console.warn(`[PDF] Skipping non-image ${imageKey} (${contentType})`);
        response.destroy();
        resolve('');
        return;
      }

      const MAX_SIZE = 5 * 1024 * 1024;
      const chunks   = [];
      let totalSize  = 0;

      response.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          response.destroy();
          console.warn(`[PDF] Image ${imageKey} exceeds 5MB, skipping`);
          resolve('');
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', async () => {
        try {
          const buffer   = Buffer.concat(chunks);
          const resized  = await sharp(buffer)
            .resize(80, 80, { fit: 'cover', withoutEnlargement: true })
            .jpeg({ quality: 70, progressive: true })
            .toBuffer();
          resolve(`data:image/jpeg;base64,${resized.toString('base64')}`);
        } catch (err) {
          console.warn(`[PDF] Sharp failed for ${imageKey}:`, err.message);
          resolve('');
        }
      });

      response.on('error', (err) => {
        console.warn(`[PDF] Stream error for ${imageKey}:`, err.message);
        resolve('');
      });
    }).on('error', (err) => {
      console.warn(`[PDF] Request error for ${imageKey}:`, err.message);
      resolve('');
    });
  });
};

// ---- Document definition ----

const buildDocDefinition = (rows, imageUrls, clientsMap, usersMap) => {
  const now = formatDate(new Date());

  const headerRow = TABLE_HEADERS.map((text) => ({
    text,
    fontSize: 8,
    bold: true,
    color: COLORS.headerText,
    margin: [2, 4, 2, 4],
  }));

  const dataRows = rows.map((r, i) => [
    cell(i + 1),
    cell(r.Name || ''),
    cell(r.Category || 'N/A'),
    badge(r.CurrentStatus || 'pending', statusColor(r.CurrentStatus)),
    cell(clientsMap[r.ClientId?.toString()] || 'N/A'),
    imageCell(imageUrls[i]),
    cell(usersMap[r.AssignedTo?.toString()] || 'N/A'),
    cell(formatDate(r.AssignedDate)),
    cell(formatDate(r.CreatedDate)),
    badge(r.Priority || 'medium', priorityColor(r.Priority)),
    cell(formatMetal(r.Metal)),
    cell(r.StoneType || 'N/A'),
    cell(r.ShippingDate ? formatDate(r.ShippingDate) : 'Not set'),
  ]);

  return {
    pageSize:        'A4',
    pageOrientation: 'landscape',
    pageMargins:     [20, 20, 20, 20],
    content: [
      {
        text:      'CHANDRA JEWELLERY',
        fontSize:  20,
        bold:      true,
        color:     COLORS.primary,
        alignment: 'center',
      },
      {
        text:      'Enquiries List Report',
        fontSize:  10,
        color:     COLORS.muted,
        alignment: 'center',
        margin:    [0, 4, 0, 0],
      },
      {
        canvas: [{
          type:      'line',
          x1: 0, y1: 6, x2: 802, y2: 6,
          lineWidth:  2,
          lineColor: COLORS.primary,
        }],
        margin: [0, 8, 0, 14],
      },
      {
        columns: [
          { text: `Total Enquiries: ${rows.length}`, fontSize: 9, bold: true },
          { text: `Generated: ${now}`, fontSize: 9, alignment: 'right', color: COLORS.muted },
        ],
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          headerRows: 1,
          widths:     TABLE_WIDTHS,
          body:       [headerRow, ...dataRows],
        },
        layout: {
          fillColor:  (rowIndex) => rowIndex === 0 ? COLORS.primary : rowIndex % 2 === 0 ? COLORS.rowAlt : null,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
      {
        columns: [
          { text: `Generated on ${now}`, fontSize: 8, color: COLORS.muted },
          { text: 'Chandra Jewellery — Enquiry Management System', fontSize: 8, color: COLORS.muted, alignment: 'center' },
          { text: `Total Records: ${rows.length}`, fontSize: 8, color: COLORS.muted, alignment: 'right' },
        ],
        margin: [0, 20, 0, 0],
      },
    ],
  };
};

// ---- PDF buffer generation ----

const toPdfBuffer = (docDefinition) =>
  new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(docDefinition).getBuffer((buffer) => resolve(Buffer.from(buffer)));
    } catch (err) {
      reject(err);
    }
  });

// ---- Public API ----

async function buildEnquiryPdf(rows = []) {
  const startTime = Date.now();
  console.log(`[PDF] Starting generation for ${rows.length} enquiries`);

  const [clients, users] = await Promise.all([
    clientService.getClients(),
    userService.getUsers(),
  ]);

  const clientsMap = Object.fromEntries(clients.map((c) => [c._id.toString(), c.Name]));
  const usersMap   = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));

  const imageUrls  = await Promise.all(rows.map((r) => fetchImageAsBase64(getLastImageKey(r))));
  const imageCount = imageUrls.filter(Boolean).length;
  console.log(`[PDF] Fetched ${imageCount}/${rows.length} images`);

  const doc    = buildDocDefinition(rows, imageUrls, clientsMap, usersMap);
  const buffer = await toPdfBuffer(doc);

  console.log(`[PDF] Done in ${Date.now() - startTime}ms — ${(buffer.length / 1024).toFixed(1)} KB`);
  return buffer;
}

module.exports = { buildEnquiryPdf };
