const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ storage });

function dynamicUpload(req, res, next) {
  const type = req.params.type;

  let fields = [];
  if (type === 'coral' || type === 'cad') {
    fields = [
      { name: 'images', maxCount: 10 },                                                                                
      { name: 'excel', maxCount: 1 },
      { name: 'videos', maxCount: 5 } // Added video support
    ];
  } else if (type === 'reference') {
    fields = [
      { name: 'images', maxCount: 10 },
      { name: 'videos', maxCount: 5 } // Added video support
    ];
  } else if (type === 'videos') {
    // For enquiry-level video uploads
    fields = [{ name: 'videos', maxCount: 10 }];
  } else {
    return res.status(400).json({ message: 'Invalid upload type' });
  }

  upload.fields(fields)(req, res, next);
};

module.exports = dynamicUpload;