import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  return new PrismaClient();
};

const globalForPrisma = globalThis;
const db = globalForPrisma.prisma ?? prismaClientSingleton();

export { db };

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
