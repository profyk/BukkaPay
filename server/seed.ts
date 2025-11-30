import { db } from "../db/index";
import { users, walletCards, transactions, contacts } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  const [user] = await db.insert(users).values({
    id: "demo-user",
    name: "Alex Morgan",
    email: "alex.morgan@example.com",
    username: "alex_morgan",
  }).onConflictDoNothing().returning();

  console.log("User created:", user?.username);

  await db.insert(walletCards).values([
    {
      userId: "demo-user",
      title: "Fuel",
      balance: "1250.50",
      currency: "$",
      icon: "fuel",
      color: "blue",
      cardNumber: "**** 4582",
    },
    {
      userId: "demo-user",
      title: "Groceries",
      balance: "450.75",
      currency: "$",
      icon: "shopping-cart",
      color: "green",
      cardNumber: "**** 9921",
    },
    {
      userId: "demo-user",
      title: "Transport",
      balance: "85.20",
      currency: "$",
      icon: "bus",
      color: "purple",
      cardNumber: "**** 3310",
    },
    {
      userId: "demo-user",
      title: "Leisure",
      balance: "320.00",
      currency: "$",
      icon: "coffee",
      color: "orange",
      cardNumber: "**** 1209",
    },
  ]).onConflictDoNothing();

  console.log("Cards created");

  await db.insert(transactions).values([
    {
      userId: "demo-user",
      title: "Shell Station",
      category: "Fuel",
      amount: "-45.00",
      type: "expense",
      icon: "fuel",
    },
    {
      userId: "demo-user",
      title: "Sarah Jenkins",
      category: "Transfer",
      amount: "150.00",
      type: "income",
      icon: "arrow-down-left",
    },
    {
      userId: "demo-user",
      title: "Whole Foods",
      category: "Groceries",
      amount: "-123.45",
      type: "expense",
      icon: "shopping-cart",
    },
  ]).onConflictDoNothing();

  console.log("Transactions created");

  await db.insert(contacts).values([
    { userId: "demo-user", name: "Sarah", username: "sarah_j", color: "pink" },
    { userId: "demo-user", name: "Mike", username: "mike_d", color: "blue" },
    { userId: "demo-user", name: "Mom", username: "mom", color: "purple" },
    { userId: "demo-user", name: "David", username: "david_k", color: "green" },
  ]).onConflictDoNothing();

  console.log("Contacts created");
  console.log("Seeding complete!");
}

seed().catch(console.error);
