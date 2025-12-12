
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:provider/provider.dart';
import '../providers/app_state.dart';

class TransferScreen extends StatefulWidget {
  const TransferScreen({super.key});

  @override
  State<TransferScreen> createState() => _TransferScreenState();
}

class _TransferScreenState extends State<TransferScreen> {
  String amount = "0";
  String? selectedFromCardId;
  String? selectedToCardId;
  bool _isProcessing = false;

  void _handleNumberPress(String num) {
    setState(() {
      if (amount == "0" && num != ".") {
        amount = num;
      } else {
        if (num == "." && amount.contains(".")) return;
        amount += num;
      }
    });
  }

  void _handleBackspace() {
    setState(() {
      if (amount.length == 1) {
        amount = "0";
      } else {
        amount = amount.substring(0, amount.length - 1);
      }
    });
  }

  Future<void> _handleTransfer() async {
    if (selectedFromCardId == null || selectedToCardId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select both cards')),
      );
      return;
    }

    if (double.tryParse(amount) == null || double.parse(amount) <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    setState(() => _isProcessing = true);

    final appState = context.read<AppState>();
    final success = await appState.createTransaction({
      'fromCardId': selectedFromCardId,
      'toCardId': selectedToCardId,
      'amount': amount,
      'type': 'transfer',
      'category': 'transfer',
      'title': 'Card Transfer',
    });

    setState(() => _isProcessing = false);

    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Transfer successful!')),
      );
      Navigator.pop(context);
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(appState.error ?? 'Transfer failed')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          "Transfer Money",
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
      ),
      body: Consumer<AppState>(
        builder: (context, appState, _) {
          if (appState.cards.isEmpty) {
            return const Center(
              child: Text('No cards available for transfer'),
            );
          }

          if (selectedFromCardId == null) {
            selectedFromCardId = appState.cards[0].id;
          }
          if (selectedToCardId == null && appState.cards.length > 1) {
            selectedToCardId = appState.cards[1].id;
          }

          return Column(
            children: [
              const SizedBox(height: 24),
              
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24.0),
                child: Column(
                  children: [
                    _buildCardSelector(
                      "From",
                      appState.cards,
                      selectedFromCardId,
                      (val) => setState(() => selectedFromCardId = val),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          border: Border.all(color: Colors.grey.shade300),
                          shape: BoxShape.circle,
                        ),
                        child: const RotatedBox(
                          quarterTurns: 1,
                          child: Icon(LucideIcons.arrowRight, size: 16, color: Colors.grey),
                        ),
                      ),
                    ),
                    _buildCardSelector(
                      "To",
                      appState.cards,
                      selectedToCardId,
                      (val) => setState(() => selectedToCardId = val),
                    ),
                  ],
                ),
              ),

              const Spacer(),
              
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "\$",
                    style: TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade400,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    amount,
                    style: const TextStyle(
                      fontSize: 64,
                      fontWeight: FontWeight.bold,
                      height: 1.0,
                    ),
                  ),
                ],
              ),

              const Spacer(),

              Container(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: GridView.count(
                  shrinkWrap: true,
                  crossAxisCount: 3,
                  childAspectRatio: 1.5,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "."].map(
                      (num) => _buildNumpadButton(num, () => _handleNumberPress(num)),
                    ),
                    _buildNumpadButton("0", () => _handleNumberPress("0")),
                    IconButton(
                      icon: const Icon(LucideIcons.delete),
                      onPressed: _handleBackspace,
                    ),
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.all(24.0),
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _isProcessing ? null : _handleTransfer,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).primaryColor,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      elevation: 5,
                      shadowColor: Theme.of(context).primaryColor.withOpacity(0.4),
                    ),
                    child: _isProcessing
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            "Complete Transfer",
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildCardSelector(
    String label,
    List cards,
    String? selectedId,
    Function(String?) onChanged,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: selectedId,
                isExpanded: true,
                items: cards.map((card) {
                  return DropdownMenuItem<String>(
                    value: card.id,
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: card.gradientColors),
                          ),
                          child: Icon(card.icon, color: Colors.white, size: 18),
                        ),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              label,
                              style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                            ),
                            Text(
                              card.title,
                              style: const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }).toList(),
                onChanged: onChanged,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNumpadButton(String text, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Center(
        child: Text(
          text,
          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w500),
        ),
      ),
    );
  }
}
