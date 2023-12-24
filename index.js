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

const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  const query = { email: email }
  const user = await usersCollection.findOne(query);
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return res.status(403).send({ message: "Forbidden Access" });
  }
  next();
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
    const categoryCollection = client.db('survey360').collection('category');
    const surveyCollection = client.db('survey360').collection('surveys');
    const userCollection = client.db('survey360').collection('users');
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
    // data related APIs
    app.get('/categories', async (req, res) => {
      const result = await categoryCollection.find().toArray();
      res.send(result);
    });
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })
    app.post('/surveys/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const survey = req.body;
      const result = await surveyCollection.insertOne(survey);
      res.send(result);
    });
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
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