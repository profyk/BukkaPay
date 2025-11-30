import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../models/mock_data.dart';
import '../widgets/wallet_card.dart';
import '../widgets/bottom_nav.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            SingleChildScrollView(
              padding: const EdgeInsets.only(bottom: 100),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 24),
                    Text(
                      "My Cards",
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      "Manage your budgeting cards",
                      style: TextStyle(
                        color: Colors.grey.shade500,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 32),
                    
                    ...mockCards.asMap().entries.map((entry) {
                      final index = entry.key;
                      final card = entry.value;
                      return Column(
                        children: [
                          WalletCardWidget(card: card),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 4.0, vertical: 8.0),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  "${card.title} Budget",
                                  style: const TextStyle(fontWeight: FontWeight.w500),
                                ),
                                RichText(
                                  text: TextSpan(
                                    style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                                    children: [
                                      const TextSpan(text: "Spent "),
                                      TextSpan(
                                        text: "\$340.00",
                                        style: TextStyle(
                                          color: Colors.grey.shade900,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      const TextSpan(text: " / \$1000"),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            height: 8,
                            margin: const EdgeInsets.only(bottom: 24),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: (index + 1) * 0.2,
                                backgroundColor: Colors.grey.shade200,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  card.gradientColors.first,
                                ),
                              ),
                            ),
                          ),
                        ],
                      );
                    }),

                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Colors.grey.shade300,
                          style: BorderStyle.solid,
                          width: 1, // Dashed border is harder in Flutter without packages, using solid for now
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(LucideIcons.plus, color: Colors.grey.shade500),
                          const SizedBox(width: 8),
                          Text(
                            "Add New Card",
                            style: TextStyle(
                              color: Colors.grey.shade500,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: BottomNav(currentIndex: 1),
            ),
          ],
        ),
      ),
    );
  }
}
