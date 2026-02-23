import express from "express";
import validateEnhanced from "./routes/validateEnhanced.js";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

app.post("/ai/validate-enhanced", validateEnhanced);
app.get("/health", (req, res) => res.json({ status: "OK" }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`AI Validation server running on port ${PORT}`));

