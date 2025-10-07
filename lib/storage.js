import fs from "fs/promises";
import mongoose from "mongoose";

export class Storage {
  constructor({ mongoUri, fallbackFile }) {
    this.mongoUri = mongoUri;
    this.fallbackFile = fallbackFile;
    this.mode = "file"; // default
  }

  async init() {
    if (this.mongoUri) {
      try {
        await mongoose.connect(this.mongoUri);
        const schema = new mongoose.Schema({
          type: String,
          title: String,
          message: String,
          contact: String,
          createdAt: Date
        }, { timestamps: true });
        this.Feedback = mongoose.model("Feedback", schema);
        this.mode = "mongo";
        return;
      } catch (e) {
        console.warn("MongoDB init failed, falling back to file storage.", e?.message);
      }
    }
    // fallback file init
    try {
      await fs.access(this.fallbackFile).catch(async () => {
        await fs.writeFile(this.fallbackFile, JSON.stringify([]), "utf8");
      });
      this.mode = "file";
    } catch (e) {
      console.error("File storage init failed:", e?.message);
    }
  }

  async saveFeedback(doc) {
    if (this.mode === "mongo" && this.Feedback) {
      const saved = await this.Feedback.create(doc);
      return saved;
    }
    // file fallback
    const raw = await fs.readFile(this.fallbackFile, "utf8").catch(() => "[]");
    const arr = JSON.parse(raw || "[]");
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    arr.push({ id, ...doc });
    await fs.writeFile(this.fallbackFile, JSON.stringify(arr, null, 2), "utf8");
    return { id };
  }
}
