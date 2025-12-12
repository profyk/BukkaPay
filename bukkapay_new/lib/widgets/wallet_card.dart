import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/data_models.dart';

class WalletCardWidget extends StatelessWidget {
  final WalletCardModel card;

  const WalletCardWidget({super.key, required this.card});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      child: AspectRatio(
        aspectRatio: 1.58 / 1,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: card.gradientColors,
            ),
            boxShadow: [
              BoxShadow(
                color: card.gradientColors.first.withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Stack(
            children: [
              // Texture Overlay (Simplified as gradient for Flutter)
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Colors.white.withOpacity(0.1), Colors.transparent],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.2),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(card.icon, color: Colors.white, size: 18),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              card.title,
                              style: GoogleFonts.outfit(
                                color: Colors.white.withOpacity(0.9),
                                fontWeight: FontWeight.w500,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          "VISA",
                          style: GoogleFonts.outfit(
                            color: Colors.white.withOpacity(0.8),
                            fontWeight: FontWeight.bold,
                            fontStyle: FontStyle.italic,
                            fontSize: 18,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Balance",
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.7),
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "${card.currency}${card.balance.toStringAsFixed(2)}",
                          style: GoogleFonts.outfit(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          card.cardNumber,
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.8),
                            letterSpacing: 2,
                            fontFamily: 'Monospace',
                          ),
                        ),
                        Text(
                          "12/28",
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.7),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
