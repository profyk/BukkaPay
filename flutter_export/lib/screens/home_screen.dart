
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../widgets/wallet_card.dart';
import '../widgets/bottom_nav.dart';
import 'scan_screen.dart';
import 'transfer_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadData();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Consumer<AppState>(
              builder: (context, appState, _) {
                if (appState.isLoading && appState.cards.isEmpty) {
                  return const Center(child: CircularProgressIndicator());
                }

                return RefreshIndicator(
                  onRefresh: () => appState.loadData(),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(bottom: 100),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 24),
                          _buildHeader(appState),
                          const SizedBox(height: 32),
                          
                          if (appState.cards.isNotEmpty)
                            WalletCardWidget(card: appState.cards[0])
                          else
                            _buildEmptyCard(),
                          
                          const SizedBox(height: 32),
                          _buildQuickActions(),
                          const SizedBox(height: 32),
                          _buildRecentActivity(appState),
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
              child: BottomNav(currentIndex: 0),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(AppState appState) {
    final userName = appState.currentUser?.name ?? 'User';
    final initial = userName.isNotEmpty ? userName[0].toUpperCase() : 'U';

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Theme.of(context).primaryColor.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  initial,
                  style: TextStyle(
                    color: Theme.of(context).primaryColor,
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Welcome back,",
                  style: TextStyle(
                    color: Colors.grey.shade500,
                    fontSize: 12,
                  ),
                ),
                Text(
                  userName,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ],
            ),
          ],
        ),
        Row(
          children: [
            _buildHeaderIcon(LucideIcons.search),
            const SizedBox(width: 12),
            Stack(
              children: [
                _buildHeaderIcon(LucideIcons.bell),
                Positioned(
                  top: 2,
                  right: 2,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Colors.red,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildEmptyCard() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.grey.shade300, width: 2),
      ),
      child: Column(
        children: [
          Icon(LucideIcons.wallet, size: 48, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            'No cards yet',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.grey.shade600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Create your first budgeting card',
            style: TextStyle(color: Colors.grey.shade500),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Quick Actions",
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildActionButton(LucideIcons.send, "Send", Colors.blue, () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const TransferScreen()),
              );
            }),
            _buildActionButton(LucideIcons.arrowDownLeft, "Request", Colors.purple, () {}),
            _buildActionButton(LucideIcons.plus, "Top Up", Colors.green, () {}),
            _buildActionButton(LucideIcons.scanLine, "Scan", Colors.orange, () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ScanScreen()),
              );
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildRecentActivity(AppState appState) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              "Recent Activity",
              style: Theme.of(context).textTheme.titleLarge,
            ),
            TextButton(
              onPressed: () {},
              child: const Text("See All"),
            ),
          ],
        ),
        const SizedBox(height: 16),
        
        if (appState.transactions.isEmpty)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32.0),
              child: Text(
                'No transactions yet',
                style: TextStyle(color: Colors.grey.shade500),
              ),
            ),
          )
        else
          ...appState.transactions.take(5).map((tx) => Container(
            margin: const EdgeInsets.only(bottom: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade100,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(tx.icon, color: Colors.grey.shade600, size: 20),
                    ),
                    const SizedBox(width: 16),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tx.title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        Text(
                          "${tx.date} • ${tx.category}",
                          style: TextStyle(
                            color: Colors.grey.shade500,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                Text(
                  "${tx.type == 'income' ? '+' : '-'}\$${tx.amount.toStringAsFixed(2)}",
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: tx.type == 'income' ? Colors.green : Colors.black,
                  ),
                ),
              ],
            ),
          )),
      ],
    );
  }

  Widget _buildHeaderIcon(IconData icon) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade200),
        shape: BoxShape.circle,
      ),
      child: Icon(icon, color: Colors.grey.shade600, size: 20),
    );
  }

  Widget _buildActionButton(IconData icon, String label, MaterialColor color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: color.shade500,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: color.shade200,
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }
}
