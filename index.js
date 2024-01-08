const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const SSLCommerzPayment = require('sslcommerz-lts');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWD;
const is_live = false;

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const categoryCollection = client.db('survey360').collection('category');
    const surveyCollection = client.db('survey360').collection('surveys');
    const userCollection = client.db('survey360').collection('users');
    const pricingCollection = client.db('survey360').collection('pricing');
    const paymentCollection = client.db('survey360').collection('payments');
    const testimonialsCollection = client.db('survey360').collection('testimonials');
    const faqCollection = client.db('survey360').collection('faq');
    // Middlewares
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
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    }
    const verifySurveyor = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      const isSurveyor = user?.role === 'surveyor';
      if (!isSurveyor) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    }
    // Payment related APIs
    const transactionId = new ObjectId().toString();
    app.post('/payment', verifyToken, async (req, res) => {
      const invoiceData = req.body;
      const userValidationQuery = { email: invoiceData?.email }
      const isAdminOrSurveyorOrPro = await userCollection.findOne(userValidationQuery);
      if (isAdminOrSurveyorOrPro?.role === "admin" || isAdminOrSurveyorOrPro?.role === "surveyor") {
        return res.send({ message: "Forbidden Access! Can't perform this action as executive panel" });
      } else if (isAdminOrSurveyorOrPro?.role === "pro") {
        return res.send({ message: "You are already a pro user! No need to buy subscription!" });
      }
      const productId = req.body.productId;
      const query = { _id: new ObjectId(productId) }
      const product = await pricingCollection.findOne(query);
      const data = {
        total_amount: product?.price,
        currency: invoiceData?.currency,
        tran_id: transactionId, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${transactionId}`,
        fail_url: 'http://localhost:3030/fail',
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: product?.name,
        product_category: "subscription",
        product_profile: 'general',
        cus_name: invoiceData?.customerName,
        cus_email: invoiceData?.email,
        cus_add1: invoiceData?.address,
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: invoiceData?.phone,
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      // console.log(data);
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        const finalInvoice = {
          product,
          paidStatus: false,
          email: invoiceData?.email,
          transactionId
        }
        const result = paymentCollection.insertOne(finalInvoice)
        res.send({ url: GatewayPageURL });
        // console.log('Redirecting to: ', GatewayPageURL)
      });
      app.post('/payment/success/:trans_id', async (req, res) => {
        const query = { transactionId: req.params.trans_id }
        const updated = {
          $set: {
            paidStatus: true,
          }
        }
        const paymentSuccess = await paymentCollection.updateOne(query, updated);
        const userUpdateSuccess = await userCollection.updateOne({ email: invoiceData?.email }, {
          $set: {
            role: "pro",
          }
        });
        if (paymentSuccess.modifiedCount > 0 && userUpdateSuccess.modifiedCount > 0) {
          res.redirect(`http://localhost:5173/payment/success/${transactionId}`);
        }
      })
    })
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
    app.get('/pricing', async (req, res) => {
      const result = await pricingCollection.find().toArray();
      res.send(result);
    });
    app.get('/pricing/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await pricingCollection.findOne(query);
      res.send(result);
    });
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
    });
    app.get('/users/surveyor/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      let surveyor = false;
      if (user) {
        surveyor = user?.role === 'surveyor';
      }
      res.send({ surveyor });
    });
    app.get('/users/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email }
      const user = await userCollection.findOne(query);
      res.send({ role: user.role });
    })
    app.get('/surveys', verifyToken, verifyAdmin, async (req, res) => {
      const result = await surveyCollection.find().toArray();
      res.send(result);
    });
    app.get('/surveys/pending/:email', verifyToken, verifySurveyor, async (req, res) => {
      const query = { status: "pending", email: req.params.email }
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    })
    app.get('/surveys/approved', async (req, res) => {
      const query = { status: "approve" }
      const result = await surveyCollection.find(query).toArray();
      res.send(result);
    });
    app.get('/surveys/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await surveyCollection.findOne(query);
      res.send(result);
    })
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.get('/user/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const result = await userCollection.findOne(query);
      res.send(result);
    });
    app.get('/survey/recent', async(req, res) => {
      const latestSurveys = await surveyCollection.find({status: "approve"}).sort({timestamp: -1}).limit(6).toArray();
      res.send(latestSurveys);
    })
    app.get('/testimonials', async(req, res) => {
      const result = await testimonialsCollection.find().toArray();
      res.send(result);
    });
    app.get('/faq', async(req, res) => {
      const result = await faqCollection.find().toArray();
      res.send(result);
    });
    app.get('/payments', verifyToken, verifyAdmin, async(req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })
    app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const assignedRole = req.body;
      const filter = { _id: new ObjectId(id) }
      const updated = {
        $set: {
          role: assignedRole.role
        }
      }
      const result = await userCollection.updateOne(filter, updated);
      res.send(result);
    })
    app.post('/surveys', verifyToken, verifySurveyor, async (req, res) => {
      const survey = req.body;
      const result = await surveyCollection.insertOne(survey);
      res.send(result);
    });
    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    app.patch('/surveys/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updatedStatus = req.body;
      const filter = { _id: new ObjectId(id) }
      const updated = {
        $set: {
          status: updatedStatus.status
        }
      }
      const result = await surveyCollection.updateOne(filter, updated);
      res.send(result);
    });
    app.put('/survey/vote/:id', verifyToken, async (req, res) => {
      const correspondingId = req.params.id;
      const vote = req.body;
      const query = { _id: new ObjectId(correspondingId) }
      const updatedYesDoc = {
        $addToSet: {
          yes: vote.voterEmail
        }
      }
      const updatedNoDoc = {
        $addToSet: {
          no: vote.voterEmail
        }
      }
      let updatedDoc = vote.vote === "yes" ? updatedYesDoc : updatedNoDoc;
      const result = await surveyCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.put('/survey/like/:id', verifyToken, async (req, res) => {
      const correspondingId = req.params.id;
      const likerEmail = req.body;
      const query = { _id: new ObjectId(correspondingId) }
      const updatedDoc = {
        $addToSet: {
          likes: likerEmail.email
        }
      }
      const result = await surveyCollection.updateOne(query, updatedDoc);
      res.send(result);
    });
    app.put('/surveys/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const newComment = req.body;
      const query = { _id: new ObjectId(id) }
      const updatedDoc = {
        $push: {
          comments: {
            email: newComment.email,
            comment: newComment.comment,
            name: newComment.name
          }
        }
      }
      const result = await surveyCollection.updateOne(query, updatedDoc);
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