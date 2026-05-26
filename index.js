const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("tutorflux");

    const tutorCollection = db.collection("tutor");

    app.get("/tutor", async (req, res) => {
      const result = await tutorCollection.find().toArray();
      res.json(result);
    });
    //  for get the tutor data
    app.post("/tutor", async (req, res) => {
      const tutorData = req.body;

      console.log(tutorData);
      const result = await tutorCollection.insertOne(tutorData);

      res.json(result);
    });

    // for tutor details page
    app.get("/tutor/:id", async (req, res) => {
      const { id } = req.params;

      const result = await tutorCollection.findOne({ _id: new ObjectId(id) });

      res.json(result);
    });

    // for edit tutor data
    app.patch("/tutor/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      console.log(updateData)

      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );
      res.json(result);
    });


    // API for delete tutor 
app.delete("/tutors/:id", async (req, res) => {
  const {id} = req.params
  const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) })
  res.json(result)
})


    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => res.send("server in running fine!"));

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`);
});
