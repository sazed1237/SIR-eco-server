const express = require('express');
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
        const paymentCollections = client.db("SIR-eco").collection("payments");


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

        app.post('/products', VerifyJWT, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await productsCollections.insertOne(item)
            res.send(result);
        })

        app.delete('/products/:id', VerifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id
            const filter = { _id: new ObjectId(id) }
            const result = await productsCollections.deleteOne(filter)
            console.log(result)
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


        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100)

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })

        })


        // get payment history
        app.get('/payments/:email', VerifyJWT, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email }
            const result = await paymentCollections.find(query).toArray()
            console.log(result)
            res.send(result);
        })


        // store payment details and delete item form carts
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollections.insertOne(payment)

            // delete each item from the cart
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }
            const deleteResult = await cartCollections.deleteMany(query)
            res.send({ paymentResult, deleteResult })
        })


        // Admin Stats 
        app.get('/admin-stats', VerifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollections.estimatedDocumentCount();
            const products = await productsCollections.estimatedDocumentCount();
            const oderResult = await paymentCollections.aggregate([
                {
                    $group: {
                        _id: null,
                        totalOrders: {
                            $sum: '$quantity'
                        }
                    }
                }
            ]).toArray()
            const orders = oderResult.length > 0 ? oderResult[0].totalOrders : 0;

            const result = await paymentCollections.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray()
            const revenue = (result.length > 0 ? result[0].totalRevenue : 0).toFixed(2)

            res.send({
                users,
                products,
                revenue,
                orders
            })
        })

        // using aggregate pipeline
        app.get('/order-stats', VerifyJWT, verifyAdmin, async (req, res) => {
            const result = await paymentCollections.aggregate([
                {
                    $unwind: '$productIds'
                },
                {
                    $addFields: {
                        productIdObject: { $toObjectId: '$productIds' }     //add temporary ObjectId field
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productIdObject',
                        foreignField: '_id',
                        as: 'products'
                    }
                },

                // {
                //     $project: {
                //         productIdObject: 0      // remove the temporary ObjectId field
                //     }
                // },

                {
                    $unwind: '$products'
                },
                {
                    $group: {
                        _id: '$products.category',
                        quantity: { $sum: 1 },      // Count the number of documents in each category
                        revenue: { $sum: '$products.price' }    // Sum the price for each category
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }


            ]).toArray()

            res.send(result)
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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