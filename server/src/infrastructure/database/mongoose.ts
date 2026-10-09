import mongoose from 'mongoose';

export const connectDatabase = async (mongoDbUri: string): Promise<void> => {
  if (!mongoDbUri) {
    throw new Error('MONGODB_URI is required to start the server.');
  }

  await mongoose.connect(mongoDbUri);
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};
