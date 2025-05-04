const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/immortal-legacy', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  level: { type: Number, default: 1 },
  totalLevel: { type: Number, default: 1 },
  experience: { type: Number, default: 0 },
  gold: { type: Number, default: 100 },
  amethyst: { type: Number, default: 0 },
  actions: { type: Number, default: 6000 },
  skills: {
    mining: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } },
    fishing: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } },
    woodcutting: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } },
    crafting: { level: { type: Number, default: 1 }, xp: { type: Number, default: 0 } }
  },
  lastAction: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      username,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    
    res.json({ token, user: { username: user.username, level: user.level } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user/profile', auth, async (req, res) => {
  res.json(req.user);
});

app.post('/api/game/battle', auth, async (req, res) => {
  try {
    const user = req.user;
    
    if (user.actions <= 0) {
      return res.status(400).json({ error: 'No actions remaining' });
    }
    
    const damage = Math.floor(Math.random() * 100000) + 200000;
    const goldReward = Math.floor(Math.random() * 1000) + 500;
    const xpReward = Math.floor(Math.random() * 100) + 50;
    
    user.actions -= 1;
    user.gold += goldReward;
    user.experience += xpReward;
    
    if (user.experience >= user.level * 1000) {
      user.level += 1;
      user.experience = 0;
    }
    
    await user.save();
    
    res.json({
      damage,
      goldReward,
      xpReward,
      remainingActions: user.actions,
      level: user.level,
      experience: user.experience
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment/create-checkout', auth, async (req, res) => {
  try {
    const { packageId } = req.body;
    
    const packages = {
      starter: { amethyst: 1000, price: 499, name: 'Starter Pack' },
      premium: { amethyst: 5000, price: 1999, name: 'Premium Pack' },
      ultimate: { amethyst: 15000, price: 4999, name: 'Ultimate Bundle' }
    };
    
    const selectedPackage = packages[packageId];
    if (!selectedPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: selectedPackage.name,
          },
          unit_amount: selectedPackage.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/store`,
      metadata: {
        userId: req.user._id.toString(),
        packageId: packageId
      }
    });
    
    res.json({ sessionId: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket server for chat
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
