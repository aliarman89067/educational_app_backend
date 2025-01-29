import mongoose, { model, Schema } from "mongoose";

const subjectSchema = new Schema(
  {
    subject: { type: String, required: true },
    years: [{ type: mongoose.Schema.Types.ObjectId, ref: "years" }],
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "topics" }],
  },
  { timestamps: true }
);

const subjectModel = model("subjects", subjectSchema);
export default subjectModel;
