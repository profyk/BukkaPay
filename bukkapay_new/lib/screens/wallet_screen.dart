
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
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
            Consumer<AppState>(
              builder: (context, appState, _) {
                return RefreshIndicator(
                  onRefresh: () => appState.refreshCards(),
                  child: SingleChildScrollView(
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
                          
                          if (appState.cards.isEmpty)
                            Center(
                              child: Padding(
                                padding: const EdgeInsets.all(48.0),
                                child: Column(
                                  children: [
                                    Icon(LucideIcons.wallet, size: 64, color: Colors.grey.shade300),
                                    const SizedBox(height: 16),
                                    Text(
                                      'No cards yet',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.bold,
                                        color: Colors.grey.shade600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          else
                            ...appState.cards.map((card) {
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
                                        Text(
                                          "Balance: ${card.currency}${card.balance.toStringAsFixed(2)}",
                                          style: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(height: 24),
                                ],
                              );
                            }),

                          GestureDetector(
                            onTap: () {
                              // TODO: Add new card dialog
                            },
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 20),
                              decoration: BoxDecoration(
                                border: Border.all(
                                  color: Colors.grey.shade300,
                                  width: 2,
                                  style: BorderStyle.solid,
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
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
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
