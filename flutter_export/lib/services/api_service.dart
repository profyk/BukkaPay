
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/data_models.dart';

class ApiService {
  static const String baseUrl = 'https://8b023d75-6566-466c-956d-714516a4b01b-00-3ntjnliclylzo.riker.replit.dev';
  
  Future<String?> _getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  Future<Map<String, String>> _getHeaders() async {
    final token = await _getToken();
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  // Auth
  Future<Map<String, dynamic>> login(String username, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'username': username,
        'password': password,
      }),
    );
    
    if (response.statusCode == 200) {
      final data = json.decode(response.body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', data['token']);
      await prefs.setString('user_id', data['user']['id'].toString());
      return data;
    }
    throw Exception('Failed to login: ${response.body}');
  }

  Future<Map<String, dynamic>> signup(Map<String, dynamic> userData) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/auth/signup'),
      headers: {'Content-Type': 'application/json'},
      body: json.encode(userData),
    );
    
    if (response.statusCode == 201) {
      final data = json.decode(response.body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', data['token']);
      await prefs.setString('user_id', data['user']['id'].toString());
      return data;
    }
    throw Exception('Failed to signup: ${response.body}');
  }

  Future<void> logout() async {
    final headers = await _getHeaders();
    await http.post(
      Uri.parse('$baseUrl/api/auth/logout'),
      headers: headers,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
  }

  Future<Map<String, dynamic>> getMe() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/api/auth/me'),
      headers: headers,
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    }
    throw Exception('Failed to get user info');
  }

  // Cards
  Future<List<WalletCardModel>> getCards() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/api/cards'),
      headers: headers,
    );
    
    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((card) => WalletCardModel.fromJson(card)).toList();
    }
    throw Exception('Failed to load cards');
  }

  Future<WalletCardModel> createCard(Map<String, dynamic> cardData) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/api/cards'),
      headers: headers,
      body: json.encode(cardData),
    );
    
    if (response.statusCode == 201) {
      return WalletCardModel.fromJson(json.decode(response.body));
    }
    throw Exception('Failed to create card');
  }

  // Transactions
  Future<List<TransactionModel>> getTransactions({int? limit}) async {
    final headers = await _getHeaders();
    String url = '$baseUrl/api/transactions';
    if (limit != null) url += '?limit=$limit';
    
    final response = await http.get(
      Uri.parse(url),
      headers: headers,
    );
    
    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((tx) => TransactionModel.fromJson(tx)).toList();
    }
    throw Exception('Failed to load transactions');
  }

  Future<TransactionModel> createTransaction(Map<String, dynamic> txData) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/api/transactions'),
      headers: headers,
      body: json.encode(txData),
    );
    
    if (response.statusCode == 201) {
      return TransactionModel.fromJson(json.decode(response.body));
    }
    throw Exception('Failed to create transaction');
  }

  // Contacts
  Future<List<ContactModel>> getContacts() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/api/contacts'),
      headers: headers,
    );
    
    if (response.statusCode == 200) {
      final List<dynamic> data = json.decode(response.body);
      return data.map((contact) => ContactModel.fromJson(contact)).toList();
    }
    throw Exception('Failed to load contacts');
  }

  // Payment Requests
  Future<Map<String, dynamic>> createPaymentRequest(Map<String, dynamic> data) async {
    final headers = await _getHeaders();
    final response = await http.post(
      Uri.parse('$baseUrl/api/payment-requests'),
      headers: headers,
      body: json.encode(data),
    );
    
    if (response.statusCode == 201) {
      return json.decode(response.body);
    }
    throw Exception('Failed to create payment request');
  }

  // Virtual Cards
  Future<List<dynamic>> getVirtualCards() async {
    final headers = await _getHeaders();
    final response = await http.get(
      Uri.parse('$baseUrl/api/virtual-cards'),
      headers: headers,
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    }
    throw Exception('Failed to load virtual cards');
  }
}
