import 'package:flutter/material.dart';

class WalletCardModel {
  final String id;
  final String title;
  final double balance;
  final String currency;
  final IconData icon;
  final List<Color> gradientColors;
  final String cardNumber;

  WalletCardModel({
    required this.id,
    required this.title,
    required this.balance,
    required this.currency,
    required this.icon,
    required this.gradientColors,
    required this.cardNumber,
  });
}

class TransactionModel {
  final String id;
  final String title;
  final String category;
  final double amount;
  final String date;
  final IconData icon;
  final String type; // 'income' or 'expense'

  TransactionModel({
    required this.id,
    required this.title,
    required this.category,
    required this.amount,
    required this.date,
    required this.icon,
    required this.type,
  });
}

class ContactModel {
  final String id;
  final String name;
  final String initial;
  final Color color;
  final Color textColor;

  ContactModel({
    required this.id,
    required this.name,
    required this.initial,
    required this.color,
    required this.textColor,
  });
}
