// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const bodyParser = require('body-parser');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

// In-memory store of alerts (keeps for current server lifetime)
let alerts = [];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Webhook endpoint — must receive raw body for verification
app.post('/razorpay-webhook', bodyParser.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-razorpay-signature'] || '';
  const payload = req.body; // Buffer
  const computed = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
                         .update(payload)
                         .digest('hex');

  if (computed !== signature) {
    console.warn('Invalid webhook signature');
    return res.status(400).send('invalid signature');
  }

  let json;
  try { json = JSON.parse(payload.toString()); } catch (e) {
    return res.status(400).send('invalid json');
  }

  console.log('Received webhook event:', json.event);

  // handle relevant events (adjust based on the events you enable)
  if (json.event === 'payment.captured' || json.event === 'payment.link.paid' || json.event === 'payment.authorized') {
    // extract payment entity (varies by event)
    const payment = (json.payload && (json.payload.payment ? json.payload.payment.entity : null)) ||
                    (json.payload && json.payload.payment_link && json.payload.payment_link.entity) ||
                    null;

    const amount = payment ? (payment.amount / 100) : null;
    const payerName = (payment && (payment.contact || payment.customer_name || payment.name)) || 'Anonymous';
    const id = (payment && payment.id) || `alert-${Date.now()}`;
    const currency = payment ? payment.currency : 'INR';

    const alertObj = {
      id,
      name: payerName,
      amount,
      currency,
      raw: json,
      ts: Date.now()
    };

    alerts.push(alertObj);
    io.emit('new_alert', alertObj);
    return res.status(200).send('ok');
  }

  res.status(200).send('ignored');
});

// endpoint to create a payment link via server (optional)
app.post('/create_payment_link', async (req, res) => {
  try {
    const amount = req.body.amount || 10; // rupees
    const customer = req.body.customer || { name: 'Supporter', email: '', contact: '' };
    const link = await razorpay.paymentLink.create({
      amount: Math.round(amount * 100),
      currency: 'INR',
      accept_partial: false,
      description: req.body.purpose || 'Donation',
      reference_id: `don-${Date.now()}`,
      customer,
      notify: { sms: false, email: false },
      reminder_enable: false
    });
    res.json({ success: true, link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// simple endpoint to get current alerts (used on overlay connect)
app.get('/alerts', (req, res) => {
  res.json({ alerts });
});

// endpoint to create a QR image data url for a supplied link (optional)
app.get('/qrcode', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('missing url');
  try {
    const dataUrl = await QRCode.toDataURL(url);
    res.json({ qrcode: dataUrl });
  } catch (e) {
    res.status(500).send('qr error');
  }
});

io.on('connection', socket => {
  console.log('socket connected', socket.id);
  // send all existing alerts to new client
  socket.emit('all_alerts', alerts);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
