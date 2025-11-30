import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../models/data_models.dart';

// Mock Data
final List<WalletCardModel> mockCards = [
  WalletCardModel(
    id: "fuel",
    title: "Fuel",
    balance: 1250.50,
    currency: "\$",
    icon: LucideIcons.fuel,
    gradientColors: [Colors.blue.shade600, Colors.blue.shade400],
    cardNumber: "**** 4582",
  ),
  WalletCardModel(
    id: "groceries",
    title: "Groceries",
    balance: 450.75,
    currency: "\$",
    icon: LucideIcons.shoppingCart,
    gradientColors: [Colors.green.shade600, Colors.green.shade400],
    cardNumber: "**** 9921",
  ),
  WalletCardModel(
    id: "transport",
    title: "Transport",
    balance: 85.20,
    currency: "\$",
    icon: LucideIcons.bus,
    gradientColors: [Colors.purple.shade600, Colors.purple.shade400],
    cardNumber: "**** 3310",
  ),
  WalletCardModel(
    id: "leisure",
    title: "Leisure",
    balance: 320.00,
    currency: "\$",
    icon: LucideIcons.coffee,
    gradientColors: [Colors.orange.shade500, Colors.pink.shade500],
    cardNumber: "**** 1209",
  ),
];

final List<TransactionModel> mockTransactions = [
  TransactionModel(
    id: "1",
    title: "Shell Station",
    category: "Fuel",
    amount: -45.00,
    date: "Today, 10:23 AM",
    icon: LucideIcons.fuel,
    type: "expense",
  ),
  TransactionModel(
    id: "2",
    title: "Sarah Jenkins",
    category: "Transfer",
    amount: 150.00,
    date: "Yesterday, 4:00 PM",
    icon: LucideIcons.arrowDownLeft,
    type: "income",
  ),
  TransactionModel(
    id: "3",
    title: "Whole Foods",
    category: "Groceries",
    amount: -123.45,
    date: "Yesterday, 2:15 PM",
    icon: LucideIcons.shoppingCart,
    type: "expense",
  ),
];

final List<ContactModel> mockContacts = [
  ContactModel(id: "1", name: "Sarah", initial: "S", color: Colors.pink.shade100, textColor: Colors.pink.shade600),
  ContactModel(id: "2", name: "Mike", initial: "M", color: Colors.blue.shade100, textColor: Colors.blue.shade600),
  ContactModel(id: "3", name: "Mom", initial: "M", color: Colors.purple.shade100, textColor: Colors.purple.shade600),
  ContactModel(id: "4", name: "David", initial: "D", color: Colors.green.shade100, textColor: Colors.green.shade600),
];
