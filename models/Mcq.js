import mongoose, { model, Schema } from "mongoose";

const mcqSchema = new Schema(
  {
    mcq: { type: String, required: true },
    options: [
      {
        text: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
      },
    ],
  },
  { timestamps: true }
);

const mcqModel = model("mcqs", mcqSchema);
export default mcqModel;
