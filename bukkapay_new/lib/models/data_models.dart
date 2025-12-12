
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

class WalletCardModel {
  final String id;
  final String title;
  final double balance;
  final String currency;
  final IconData icon;
  final List<Color> gradientColors;
  final String cardNumber;
  final String? category;

  WalletCardModel({
    required this.id,
    required this.title,
    required this.balance,
    required this.currency,
    required this.icon,
    required this.gradientColors,
    required this.cardNumber,
    this.category,
  });

  factory WalletCardModel.fromJson(Map<String, dynamic> json) {
    final category = json['category'] ?? 'default';
    final gradientColors = _getGradientForCategory(category);
    final icon = _getIconForCategory(category);
    
    return WalletCardModel(
      id: json['id'].toString(),
      title: json['title'] ?? 'Card',
      balance: double.parse(json['balance']?.toString() ?? '0'),
      currency: json['currency'] ?? '\$',
      icon: icon,
      gradientColors: gradientColors,
      cardNumber: json['cardNumber'] ?? '**** ****',
      category: category,
    );
  }

  static List<Color> _getGradientForCategory(String category) {
    switch (category.toLowerCase()) {
      case 'fuel':
        return [Colors.blue.shade600, Colors.blue.shade400];
      case 'groceries':
        return [Colors.green.shade600, Colors.green.shade400];
      case 'transport':
        return [Colors.purple.shade600, Colors.purple.shade400];
      case 'leisure':
        return [Colors.orange.shade500, Colors.pink.shade500];
      default:
        return [const Color(0xFF6366F1), const Color(0xFF8B5CF6)];
    }
  }

  static IconData _getIconForCategory(String category) {
    switch (category.toLowerCase()) {
      case 'fuel':
        return LucideIcons.fuel;
      case 'groceries':
        return LucideIcons.shoppingCart;
      case 'transport':
        return LucideIcons.bus;
      case 'leisure':
        return LucideIcons.coffee;
      default:
        return LucideIcons.wallet;
    }
  }
}

class TransactionModel {
  final String id;
  final String title;
  final String category;
  final double amount;
  final String date;
  final IconData icon;
  final String type;

  TransactionModel({
    required this.id,
    required this.title,
    required this.category,
    required this.amount,
    required this.date,
    required this.icon,
    required this.type,
  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    final category = json['category'] ?? 'other';
    final type = json['type'] ?? 'expense';
    
    return TransactionModel(
      id: json['id'].toString(),
      title: json['title'] ?? json['description'] ?? 'Transaction',
      category: category,
      amount: double.parse(json['amount']?.toString() ?? '0'),
      date: json['date'] ?? json['createdAt'] ?? 'Unknown',
      icon: _getIconForCategory(category),
      type: type,
    );
  }

  static IconData _getIconForCategory(String category) {
    switch (category.toLowerCase()) {
      case 'fuel':
        return LucideIcons.fuel;
      case 'groceries':
        return LucideIcons.shoppingCart;
      case 'transport':
        return LucideIcons.bus;
      case 'transfer':
        return LucideIcons.arrowDownLeft;
      default:
        return LucideIcons.receipt;
    }
  }
}

class ContactModel {
  final String id;
  final String name;
  final String initial;
  final Color color;
  final Color textColor;
  final String? phone;
  final String? walletId;

  ContactModel({
    required this.id,
    required this.name,
    required this.initial,
    required this.color,
    required this.textColor,
    this.phone,
    this.walletId,
  });

  factory ContactModel.fromJson(Map<String, dynamic> json) {
    final name = json['name'] ?? 'Unknown';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'U';
    
    return ContactModel(
      id: json['id'].toString(),
      name: name,
      initial: initial,
      color: _getColorForInitial(initial),
      textColor: Colors.white,
      phone: json['phone'],
      walletId: json['walletId'],
    );
  }

  static Color _getColorForInitial(String initial) {
    final colors = [
      Colors.pink.shade400,
      Colors.blue.shade400,
      Colors.purple.shade400,
      Colors.green.shade400,
      Colors.orange.shade400,
    ];
    final index = initial.codeUnitAt(0) % colors.length;
    return colors[index];
  }
}

class UserModel {
  final String id;
  final String name;
  final String email;
  final String? username;
  final String? phone;
  final String? walletId;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    this.username,
    this.phone,
    this.walletId,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'].toString(),
      name: json['name'] ?? 'User',
      email: json['email'] ?? '',
      username: json['username'],
      phone: json['phone'],
      walletId: json['walletId'],
    );
  }
}
