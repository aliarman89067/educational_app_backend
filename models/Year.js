import mongoose, { model, Schema } from "mongoose";

const yearSchema = new Schema(
  {
    year: { type: Number, required: true },
    mcqs: [{ type: mongoose.Schema.Types.ObjectId, ref: "mcqs" }],
  },
  { timestamps: true }
);

const yearModel = model("years", yearSchema);
export default yearModel;
