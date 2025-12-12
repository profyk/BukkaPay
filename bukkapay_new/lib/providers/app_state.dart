
import 'package:flutter/material.dart';
import '../models/data_models.dart';
import '../services/api_service.dart';

class AppState extends ChangeNotifier {
  final ApiService _apiService = ApiService();
  
  UserModel? _currentUser;
  List<WalletCardModel> _cards = [];
  List<TransactionModel> _transactions = [];
  List<ContactModel> _contacts = [];
  bool _isLoading = false;
  String? _error;

  UserModel? get currentUser => _currentUser;
  List<WalletCardModel> get cards => _cards;
  List<TransactionModel> get transactions => _transactions;
  List<ContactModel> get contacts => _contacts;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<bool> login(String username, String password) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final result = await _apiService.login(username, password);
      _currentUser = UserModel.fromJson(result['user']);
      
      await loadData();
      
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> signup(Map<String, dynamic> userData) async {
    try {
      _isLoading = true;
      _error = null;
      notifyListeners();

      final result = await _apiService.signup(userData);
      _currentUser = UserModel.fromJson(result['user']);
      
      await loadData();
      
      _isLoading = false;
      notifyListeners();
      return true;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _apiService.logout();
      _currentUser = null;
      _cards = [];
      _transactions = [];
      _contacts = [];
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> loadData() async {
    try {
      _isLoading = true;
      notifyListeners();

      final results = await Future.wait([
        _apiService.getCards(),
        _apiService.getTransactions(limit: 20),
        _apiService.getContacts(),
      ]);

      _cards = results[0] as List<WalletCardModel>;
      _transactions = results[1] as List<TransactionModel>;
      _contacts = results[2] as List<ContactModel>;

      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshCards() async {
    try {
      _cards = await _apiService.getCards();
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> refreshTransactions() async {
    try {
      _transactions = await _apiService.getTransactions(limit: 20);
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<bool> createTransaction(Map<String, dynamic> txData) async {
    try {
      await _apiService.createTransaction(txData);
      await refreshTransactions();
      await refreshCards();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }
}
