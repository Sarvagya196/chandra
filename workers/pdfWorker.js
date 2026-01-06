// PDF Generation Worker Thread
// This runs PDF generation in a separate thread to avoid blocking the main event loop
const { parentPort } = require('worker_threads');
const pdfMake = require("pdfmake/build/pdfmake.js");
const vfsFonts = require("pdfmake/build/vfs_fonts.js");

// Initialize pdfMake fonts
if (vfsFonts) {
  pdfMake.vfs = vfsFonts;
} else {
  throw new Error("pdfMake vfs fonts not found");
}

// Listen for messages from main thread
parentPort.on('message', ({ doc }) => {
  try {
    const startTime = Date.now();
    const pdfDoc = pdfMake.createPdf(doc);
    
    pdfDoc.getBuffer((buffer) => {
      const genTime = Date.now() - startTime;
      // Convert buffer to array for serialization (worker threads can't send Buffers directly)
      const bufferArray = Array.from(buffer);
      // Send result back to main thread
      parentPort.postMessage({ 
        success: true, 
        buffer: bufferArray,
        bufferLength: buffer.length,
        generationTime: genTime 
      });
    });
  } catch (error) {
    parentPort.postMessage({ 
      success: false, 
      error: error.message 
    });
  }
});

