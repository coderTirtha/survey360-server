const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const app = express();
const port = 5000 || process.env.PORT;

app.use(cors({
  origin: [
    'http://localhost:5173'
  ],
  credentials: true
}))
app.use(express.json());
app.use(cookieParser());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mpu9aqk.mongodb.net/?retryWrites=true&w=majority`;

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log(token);
  if (!token) {
    return res.status(401).send({ message: "Not Authorized" })
  }
  jwt.verify(token, process.env.ACCESS_WEB_TOKEN, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send("Unauthorized");
    }
    // console.log('Value in the token', decoded);
    req.user = decoded;
    next();
  });
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // Authentication related APIs
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_WEB_TOKEN, { expiresIn: '1h' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
      }).send({ success: true });
    });
    app.post('/logout', async (req, res) => {
      const user = req.body;
      console.log(user);
      res.clearCookie('token', { maxAge: 0 }).send({ success: true });
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("survey360-server is running");
});

app.listen(port, () => {
  console.log(`Server is running at PORT: ${port}`);
});