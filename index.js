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

const jwt = require("jsonwebtoken");

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET || "tutorflux_jwt_secret", (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("tutorflux");

    const tutorCollection = db.collection("tutor");
    const bookingCollection = db.collection("booking");

    // JWT Token creation endpoint
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET || "tutorflux_jwt_secret", {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // JWT logout clean endpoint (optional client helper)
    app.post("/logout", async (req, res) => {
      res.send({ success: true });
    });

    // GET all tutors with search, date filter, and limit
    app.get("/tutor", async (req, res) => {
      const { search, startDate, endDate, limit } = req.query;
      let query = {};
      if (search) {
        query.tutorName = { $regex: search, $options: "i" };
      }
      if (startDate || endDate) {
        query.sessionStartDate = {};
        if (startDate) {
          query.sessionStartDate.$gte = startDate;
        }
        if (endDate) {
          query.sessionStartDate.$lte = endDate;
        }
      }
      let cursor = tutorCollection.find(query);
      if (limit) {
        cursor = cursor.limit(parseInt(limit));
      }
      const result = await cursor.toArray();
      res.json(result);
    });

    // POST create a tutor (private)
    app.post("/tutor", verifyJWT, async (req, res) => {
      const tutorData = req.body;
      console.log("Create Tutor payload:", tutorData);
      const result = await tutorCollection.insertOne(tutorData);
      res.json(result);
    });

    // GET tutors created by the logged in user (private)
    app.get("/my-tutors", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "email query parameter is required" });
      }
      if (req.decoded.email !== email) {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      const query = { email: email };
      const result = await tutorCollection.find(query).toArray();
      res.json(result);
    });

    // GET tutor details by ID
    app.get("/tutor/:id", async (req, res) => {
      const { id } = req.params;
      const result = await tutorCollection.findOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // PATCH update tutor details (private)
    app.patch("/tutor/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;
      console.log("Update Tutor payload:", updateData);
      const result = await tutorCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData },
      );
      res.json(result);
    });

    // DELETE a tutor (private)
    app.delete("/tutors/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const result = await tutorCollection.deleteOne({ _id: new ObjectId(id) });
      res.json(result);
    });

    // POST Book Session (private)
    app.post("/booking", verifyJWT, async (req, res) => {
      const bookingData = req.body;
      const { tutorId, studentEmail, studentName, studentPhone } = bookingData;
      
      const tutor = await tutorCollection.findOne({ _id: new ObjectId(tutorId) });
      if (!tutor) {
        return res.status(404).send({ error: true, message: "Tutor not found" });
      }

      const totalSlot = parseInt(tutor.totalSlot) || 0;
      if (totalSlot <= 0) {
        return res.status(400).send({ error: true, message: "No available slots left." });
      }

      const currentDate = new Date();
      currentDate.setHours(0, 0, 0, 0);
      const sessionDate = new Date(tutor.sessionStartDate);
      sessionDate.setHours(0, 0, 0, 0);
      if (currentDate < sessionDate) {
        return res.status(400).send({ error: true, message: "Booking is not available yet for this tutor" });
      }

      const bookingDoc = {
        tutorId: tutor._id.toString(),
        tutorName: tutor.tutorName,
        studentName,
        studentPhone,
        studentEmail,
        status: "booked", // Auto-generated Book Status
        bookedAt: new Date().toISOString()
      };

      const bookingResult = await bookingCollection.insertOne(bookingDoc);

      // Decrement the slot by 1
      const updatedSlot = Math.max(0, (parseInt(tutor.totalSlot) || 0) - 1);
      await tutorCollection.updateOne(
        { _id: tutor._id },
        { $set: { totalSlot: updatedSlot } }
      );

      res.json({ success: true, result: bookingResult });
    });

    // GET My Booked Sessions (private)
    app.get("/my-bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "email query parameter is required" });
      }
      if (req.decoded.email !== email) {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      const result = await bookingCollection.find({ studentEmail: email }).toArray();
      res.json(result);
    });

    // PATCH cancel booking (private)
    app.patch("/booking/:id/cancel", verifyJWT, async (req, res) => {
      const { id } = req.params;
      const booking = await bookingCollection.findOne({ _id: new ObjectId(id) });
      if (!booking) {
        return res.status(404).send({ error: true, message: "Booking not found" });
      }
      const result = await bookingCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "cancelled" } }
      );
      res.json(result);
    });

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
