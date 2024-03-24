const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5001;


// middleware
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4lef0mm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        await client.connect();

        const userCollections = client.db("SIR-eco").collection("users");
        const productsCollections = client.db("SIR-eco").collection("products");
        const cartCollections = client.db("SIR-eco").collection("carts");


        // jwt API
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token })
        })

        // middleware
        // VerifyJWT 
        const VerifyJWT = (req, res, next) => {
            console.log('inside verify token', req.headers.authorization)
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'forbidden access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'forbidden access' });
                }
                req.decoded = decoded;
                next()
            })
        }

        // use verify admin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollections.findOne(query)
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


        // User API
        app.get('/users', VerifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollections.find().toArray()
            res.send(users)
        })

        app.get('/users/admin/:email', VerifyJWT, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollections.findOne(query)
            let admin = false;

            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin })
        })


        app.post('/users', async (req, res) => {
            const user = req.body;
            // check user in exist or not
            const query = { email: user.email }
            const existUser = await userCollections.findOne(query)
            if (existUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollections.insertOne(user)
            res.send(result)
        })

        // make admin
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollections.updateOne(filter, updatedDoc)
            res.send(result)
        })

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await userCollections.deleteOne(filter)
            res.send(result)
        })


        // get all products
        app.get('/products', async (req, res) => {
            const product = await productsCollections.find().toArray()
            res.send(product)
        })

        app.get('/products/:id', async (req, res) => {
            const id = req.params;
            console.log(id)
            const filter = { _id: new ObjectId(id) }
            const result = await productsCollections.findOne(filter)
            res.send(result)
        })




        // cart Collections 
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const cartItems = await cartCollections.find(query).toArray()
            res.send(cartItems)
        })


        app.post('/carts', async (req, res) => {
            const food = req.body;
            const result = await cartCollections.insertOne(food)
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const result = await cartCollections.deleteOne(filter)
            res.send(result)
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





app.get('/', async (req, res) => {
    res.send('welcome to SIR eoc')
})

app.listen(port, () => {
    console.log(`SIR is Running on ${port}`)
})