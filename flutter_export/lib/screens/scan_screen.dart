import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  bool isScanMode = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: isScanMode ? Colors.black : Theme.of(context).primaryColor,
      body: Stack(
        children: [
          // Background
          if (isScanMode)
            Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 0.8,
                  colors: [
                    Colors.grey.shade800,
                    Colors.black,
                  ],
                ),
              ),
            )
          else
            Container(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.center,
                  radius: 0.8,
                  colors: [
                    Theme.of(context).primaryColor.withOpacity(0.8),
                    Theme.of(context).primaryColor,
                  ],
                ),
              ),
            ),

          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _buildGlassButton(
                        icon: LucideIcons.arrowLeft,
                        onTap: () => Navigator.pop(context),
                      ),
                      Text(
                        isScanMode ? "Scan Code" : "My Code",
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (!isScanMode)
                        _buildGlassButton(icon: LucideIcons.share2, onTap: () {})
                      else
                        const SizedBox(width: 40),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (isScanMode)
                        SizedBox(
                          width: 280,
                          height: 280,
                          child: Stack(
                            children: [
                              // Scanning Frame Corners
                              _buildCorner(Alignment.topLeft),
                              _buildCorner(Alignment.topRight),
                              _buildCorner(Alignment.bottomLeft),
                              _buildCorner(Alignment.bottomRight),
                              
                              Center(
                                child: Icon(
                                  LucideIcons.qrCode,
                                  size: 100,
                                  color: Colors.white.withOpacity(0.2),
                                ),
                              ),
                              
                              // Animated Line would go here
                            ],
                          ),
                        )
                      else
                        Container(
                          padding: const EdgeInsets.all(32),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(32),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.2),
                                blurRadius: 20,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: Column(
                            children: [
                              const Icon(LucideIcons.qrCode, size: 200, color: Colors.black),
                              const SizedBox(height: 16),
                              const Text(
                                "@alex_morgan",
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      
                      const SizedBox(height: 32),
                      Text(
                        isScanMode 
                          ? "Align the QR code within the frame." 
                          : "Show this code to receive money.",
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.8),
                          fontSize: 14,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(bottom: 48.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildToggle(
                        context,
                        label: "Scan",
                        icon: LucideIcons.qrCode,
                        isSelected: isScanMode,
                        onTap: () => setState(() => isScanMode = true),
                      ),
                      const SizedBox(width: 48),
                      _buildToggle(
                        context,
                        label: "My Code",
                        icon: LucideIcons.qrCode,
                        isSelected: !isScanMode,
                        onTap: () => setState(() => isScanMode = false),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGlassButton({required IconData icon, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.2),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _buildCorner(Alignment alignment) {
    final isTop = alignment.y == -1.0;
    final isLeft = alignment.x == -1.0;
    return Align(
      alignment: alignment,
      child: Container(
        width: 30,
        height: 30,
        decoration: BoxDecoration(
          border: Border(
            top: isTop ? const BorderSide(color: Colors.white, width: 4) : BorderSide.none,
            bottom: !isTop ? const BorderSide(color: Colors.white, width: 4) : BorderSide.none,
            left: isLeft ? const BorderSide(color: Colors.white, width: 4) : BorderSide.none,
            right: !isLeft ? const BorderSide(color: Colors.white, width: 4) : BorderSide.none,
          ),
        ),
      ),
    );
  }

  Widget _buildToggle(BuildContext context, {
    required String label,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 56,
            height: 56,
            transform: isSelected ? Matrix4.diagonal3Values(1.1, 1.1, 1.0) : Matrix4.identity(),
            decoration: BoxDecoration(
              color: isSelected ? Colors.white : Colors.white.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              color: isSelected ? Colors.black : Colors.white,
              size: 24,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
