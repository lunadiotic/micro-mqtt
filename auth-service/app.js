const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('./utils/jwt');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Dummy user database
const users = [{ id: 1, username: 'test', password: 'password' }];

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username });
    res.json({ token });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
