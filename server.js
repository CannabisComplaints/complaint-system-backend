const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { GridFSBucket } = require('mongodb');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB Connection (replace with your copied string)
let gfs;
const conn = mongoose.createConnection('mongodb+srv://<username>:<password>@cannabiscomplaintsnew.mongodb.net/cannabis_complaints?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
conn.once('open', () => {
  gfs = new GridFSBucket(conn.db, { bucketName: 'photos' });
  console.log('MongoDB and GridFS connected');
});
conn.on('error', (err) => console.error('MongoDB connection error:', err));

// Complaint Schema
const complaintSchema = new mongoose.Schema({
  customerName: { type: String },
  customerEmail: { type: String },
  state: { type: String, enum: ['MI', 'MD', 'PA', 'WV', 'OK'], required: true },
  productId: { type: String, required: true },
  complaintDetails: { type: String, required: true },
  complaintType: { type: String, enum: ['Quality', 'Packaging', 'Service', 'Other'] },
  submitterRole: { type: String, enum: ['Customer', 'Staff'] },
  photoId: { type: mongoose.Schema.Types.ObjectId },
  status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
  createdAt: { type: Date, default: Date.now }
});

const Complaint = mongoose.model('Complaint', complaintSchema);

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg'];
    if (file && allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else if (file) {
      cb(new Error('Only PNG and JPEG files are allowed'));
    } else {
      cb(null, false); // Allow no file
    }
  }
});

// Staff login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.STAFF_PASSWORD) {
    res.status(200).json({ message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid password' });
  }
});

// Middleware to check password
const checkPassword = (req, res, next) => {
  const password = req.headers['x-staff-password'];
  if (password === process.env.STAFF_PASSWORD) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized' });
  }
};

// Get all complaints (protected)
app.get('/api/complaints', checkPassword, async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit complaint (public)
app.post('/api/complaints', upload.single('photo'), async (req, res) => {
  try {
    const { state, productId, complaintDetails, customerName, customerEmail, complaintType, submitterRole } = req.body;
    if (!state || !productId || !complaintDetails) {
      return res.status(400).json({ message: 'State, product ID, and complaint details are required' });
    }

    let photoId = null;
    if (req.file) {
      const uploadStream = gfs.openUploadStream(req.file.originalname, {
        contentType: req.file.mimetype
      });
      uploadStream.end(req.file.buffer);
      photoId = uploadStream.id;
    }

    const complaint = new Complaint({
      state,
      productId,
      complaintDetails,
      customerName,
      customerEmail,
      complaintType,
      submitterRole,
      photoId
    });
    await complaint.save();
    res.status(201).json(complaint);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Resolve complaint (protected)
app.put('/api/complaints/:id', checkPassword, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const complaint = await Complaint.findByIdAndUpdate(id, { status }, { new: true });
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));