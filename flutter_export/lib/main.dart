import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const BukkaPayApp());
}

class BukkaPayApp extends StatelessWidget {
  const BukkaPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Lock orientation to portrait
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
    ]);

    return MaterialApp(
      title: 'BukkaPay',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6366F1), // Violet/Indigo
          brightness: Brightness.light,
          background: const Color(0xFFF8F9FA),
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8F9FA),
        textTheme: GoogleFonts.interTextTheme(
          Theme.of(context).textTheme,
        ).copyWith(
          displayLarge: GoogleFonts.outfit(
            fontWeight: FontWeight.bold,
          ),
          displayMedium: GoogleFonts.outfit(
            fontWeight: FontWeight.bold,
          ),
          headlineLarge: GoogleFonts.outfit(
            fontWeight: FontWeight.bold,
          ),
          headlineMedium: GoogleFonts.outfit(
            fontWeight: FontWeight.bold,
          ),
          titleLarge: GoogleFonts.outfit(
            fontWeight: FontWeight.bold,
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: true,
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
