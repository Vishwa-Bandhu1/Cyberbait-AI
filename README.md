# CyberBait: An AI-Powered SMS & Phishing Protection 🛡️

**CyberBait** is a full-stack, cross-platform cybersecurity companion application designed to protect users from scam conversations and phishing threats. It leverages advanced AI models to analyze suspicious texts, extracts insights from images using OCR, and provides real-time protection against malicious SMS messages.

---

## 🚀 Features

- **Hybrid SMS Detection**: Combines a native Android BroadcastReceiver with a **Direct Inbox Polling** mechanism (using `react-native-get-sms-android`) to ensure 100% detection reliability, even on devices with aggressive OEM background restrictions (Realme, Oppo, Vivo).
- **Proactive Sender Blocking**: Integrates Android's Call Screening and Default SMS roles, enabling users to instantly block detected phishing senders directly from the threat analysis screen.
- **AI-Powered Analysis**: Seamlessly integrates with **MIET AI Gateway (College AI API)** for rapid evaluation of potential cybersecurity threats.
- **OEM-Specific Optimization**: Specialized fallback mechanisms for **Realme, Oppo, and Vivo** devices to ensure reliable background detection despite aggressive battery management.
- **Cross-Platform Mobile App**: Built with React Native CLI, featuring a premium cyber-themed dark-mode UI with smooth animations, responsive risk meters, and dynamic keyword visualization (Reanimated v4, Lottie).
- **On-Device OCR**: Extracts text from screenshots and suspicious documents utilizing **Tesseract OCR**.
- **Professional Security Reports**: Automatically compiles findings into downloadable, structured PDF reports using **iText 7**.
- **Secure Cloud Sync**: Stores analysis history and reports securely in a **MongoDB Atlas** cluster.
- **Modern Backend**: High-performance REST APIs structured with Spring Boot 3 featuring proactive error handling and model fallbacks.
- **Dynamic Backend Connectivity & Failover Routing**: Auto-detects local host configurations (adb-reverse USB mode vs. LAN/Wi-Fi connection) and handles temporary connection drops gracefully via a custom client-side retry/failover mechanism with health probes.
- **Dedicated Health Checks**: Integrated `/api/health` endpoint on the backend for real-time connection status validation to prevent app lock-ups or freeze-ups during network transitions.

---

## 💻 Tech Stack

### Frontend (Mobile App)
- **Framework**: React Native CLI (`react-native` v0.85)
- **Navigation**: React Navigation v7
- **UI & Animations**: Reanimated v4, Lottie React Native, React Native Linear Gradient
- **Native Modules**: Custom Kotlin modules for SMS interception, call screening, default app role requests, and `react-native-get-sms-android` for robust inbox polling.

### Backend (Server)
- **Framework**: Spring Boot 3.4.5 (Java 17)
- **Database**: MongoDB (Spring Data MongoDB)
- **OCR Engine**: Tess4J (Tesseract v5.11)
- **PDF Generation**: iText 7 Core
- **AI Integration**: MIET AI Gateway (gpt-oss:20b)

---

## 🛠️ Prerequisites

To run this project locally, ensure you have the following installed:

- **Node.js** (v22+) & npm/yarn
- **React Native Development Environment**: Android Studio / Xcode configured for CLI.
- **Java Development Kit (JDK)**: Version 17
- **Apache Maven**: For building the Spring Boot application.
- **Tesseract OCR Language Data**: Specifically the `tessdata` folder containing `eng.traineddata`.
- **College AI Gateway Account**: To obtain an AI Gateway Token.
- **MongoDB Atlas Cluster**: Or a local MongoDB instance.

---

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone https://github.com/Vishwa-Bandhu1/Kinetic-Vault.git
cd Kinetic-Vault
```

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd kineticvault-backend
   ```
2. **Configure Secrets**:
   Copy the example properties file and fill in your credentials.
   ```bash
   cp src/main/resources/application.properties.example src/main/resources/application.properties
   ```
   Open `application.properties` and add your:
   - MongoDB connection string.
   - MIET AI Gateway Token.
3. Build and run the server:
   ```bash
   ./mvnw clean install
   ./mvnw spring-boot:run
   ```
   *The server will start on port 8080 by default.*

### 3. Frontend Setup
1. Navigate to the app directory:
   ```bash
   cd KineticVaultApp
   ```
2. Install dependencies:
   ```bash
   npm install
   # or yarn install
   ```
   - **Configure local backend connectivity** (runs automatically with `npm run android` or `npm run start`):
     ```bash
     npm run configure:backend
     ```
     *This script auto-detects connected USB devices to set up `adb reverse` (port 8080 mapping) or resolves local Wi-Fi LAN IP to enable physical devices to reach the backend host.*
   - **For Android**:
     ```bash
     npm run android
     ```
   - **For iOS** *(macOS only)*:
     ```bash
     cd ios && pod install && cd ..
     npm run ios
     ```

---

## 🛡️ License

This project is licensed under the MIT License - see the `LICENSE` file for details.

