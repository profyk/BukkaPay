import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:flutter_export/screens/home_screen.dart';
import 'package:flutter_export/screens/wallet_screen.dart';
import 'package:flutter_export/screens/scan_screen.dart';
import 'package:flutter_export/screens/transfer_screen.dart';
import 'package:flutter_export/screens/profile_screen.dart';

class BottomNav extends StatelessWidget {
  final int currentIndex;

  const BottomNav({super.key, required this.currentIndex});

  void _onItemTapped(BuildContext context, int index) {
    if (index == currentIndex) return;

    Widget page;
    switch (index) {
      case 0:
        page = const HomeScreen();
        break;
      case 1:
        page = const WalletScreen();
        break;
      case 2:
        page = const ScanScreen();
        break;
      case 3:
        page = const TransferScreen();
        break;
      case 4:
        page = const ProfileScreen();
        break;
      default:
        page = const HomeScreen();
    }

    Navigator.pushReplacement(
      context,
      PageRouteBuilder(
        pageBuilder: (context, animation1, animation2) => page,
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.9),
        border: Border(top: BorderSide(color: Colors.grey.shade200)),
      ),
      padding: const EdgeInsets.only(bottom: 20, top: 10), // Adjust for SafeArea
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(context, 0, LucideIcons.home, "Home"),
          _buildNavItem(context, 1, LucideIcons.wallet, "Cards"),
          _buildScanButton(context),
          _buildNavItem(context, 3, LucideIcons.arrowRightLeft, "Transfer"),
          _buildNavItem(context, 4, LucideIcons.user, "Profile"),
        ],
      ),
    );
  }

  Widget _buildNavItem(BuildContext context, int index, IconData icon, String label) {
    final bool isActive = currentIndex == index;
    final Color color = isActive ? Theme.of(context).primaryColor : Colors.grey;

    return GestureDetector(
      onTap: () => _onItemTapped(context, index),
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScanButton(BuildContext context) {
    return GestureDetector(
      onTap: () => _onItemTapped(context, 2),
      child: Container(
        margin: const EdgeInsets.only(bottom: 20), // Float effect
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: Theme.of(context).primaryColor,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Theme.of(context).primaryColor.withOpacity(0.3),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: const Icon(LucideIcons.scanLine, color: Colors.white, size: 28),
      ),
    );
  }
}
