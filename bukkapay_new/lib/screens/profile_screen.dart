
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';
import '../widgets/bottom_nav.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Stack(
          children: [
            Consumer<AppState>(
              builder: (context, appState, _) {
                final user = appState.currentUser;
                final userName = user?.name ?? 'User';
                final userEmail = user?.email ?? '';
                final initial = userName.isNotEmpty ? userName.substring(0, 2).toUpperCase() : 'U';

                return SingleChildScrollView(
                  padding: const EdgeInsets.only(bottom: 100),
                  child: Column(
                    children: [
                      const SizedBox(height: 24),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 24.0),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            "Profile",
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 32),
                      
                      Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: Theme.of(context).primaryColor.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(
                            initial,
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).primaryColor,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        userName,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        userEmail,
                        style: TextStyle(
                          color: Colors.grey.shade500,
                          fontSize: 14,
                        ),
                      ),
                      if (user?.walletId != null) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Theme.of(context).primaryColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            'ID: ${user!.walletId}',
                            style: TextStyle(
                              color: Theme.of(context).primaryColor,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 40),

                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24.0),
                        child: Column(
                          children: [
                            _buildMenuItem(context, LucideIcons.user, "Personal Information"),
                            _buildMenuItem(context, LucideIcons.shield, "Security & Privacy"),
                            _buildMenuItem(context, LucideIcons.bell, "Notifications"),
                            _buildMenuItem(context, LucideIcons.helpCircle, "Help & Support"),
                            
                            const SizedBox(height: 24),
                            _buildMenuItem(
                              context,
                              LucideIcons.logOut,
                              "Log Out",
                              isDestructive: true,
                              onTap: () async {
                                await appState.logout();
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
            const Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: BottomNav(currentIndex: 4),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMenuItem(
    BuildContext context,
    IconData icon,
    String label, {
    bool isDestructive = false,
    VoidCallback? onTap,
  }) {
    final color = isDestructive ? Colors.red : Colors.black;
    final bgColor = isDestructive ? Colors.red.shade50 : Colors.grey.shade100;
    final iconColor = isDestructive ? Colors.red : Colors.black;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap ?? () {},
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: bgColor,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(icon, color: iconColor, size: 20),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: color,
                    ),
                  ),
                ),
                Icon(LucideIcons.chevronRight, size: 20, color: Colors.grey.shade400),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
