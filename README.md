# Arbitrage Detector 🚀

A sophisticated **real-time cryptocurrency arbitrage detection platform** built with Next.js 14, featuring the **Bellman-Ford algorithm** for cycle detection and live **Binance WebSocket integration**.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

## ✨ Features

### 🔥 Core Functionality
- **Real-time Arbitrage Detection** using advanced Bellman-Ford algorithm
- **Live Binance Data Stream** via WebSocket (all USDT pairs)
- **Interactive Currency Graph** with force-directed visualization
- **Smart Algorithm Configuration** (iterations, profit thresholds, path length)
- **CSV Import/Export** for exchange rate data
- **Desktop & Sound Notifications** for high-profit opportunities

### 🎨 User Experience
- **Dark Mode** with crypto trading aesthetic
- **Responsive Design** optimized for desktop trading
- **Real-time Connection Status** with quality indicators
- **Toast Notifications** for all user actions
- **Loading States** for smooth async operations
- **Auto-reconnect** with exponential backoff

### 📊 Monitoring & Analytics
- **Algorithm Debug Console** with real-time logs
- **Performance Statistics** with interactive charts
- **Arbitrage History Table** with sorting and filtering
- **Connection Quality Monitoring** 
- **Success Rate Tracking**

### 🛠️ Technical Stack
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **UI Components**: shadcn/ui with custom dark theme
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Server-Sent Events, WebSocket
- **Visualization**: React Force Graph 2D, Recharts
- **State Management**: React Hooks, Custom Stream Hook

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ 
- **PostgreSQL** 12+
- **Git**

### 1. Clone Repository
```bash
git clone https://github.com/your-username/arbitrage-detector.git
cd arbitrage-detector
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/arbitrage_detector?schema=public"

# WebSocket Configuration
NEXT_PUBLIC_WS_URL="wss://stream.binance.com:9443/ws/!ticker@arr"
NEXT_PUBLIC_API_BASE_URL="http://localhost:3000"

# App Settings
NEXT_PUBLIC_MAX_RECONNECT_ATTEMPTS=10
NEXT_PUBLIC_RECONNECT_DELAY=3000
NEXT_PUBLIC_ENABLE_NOTIFICATIONS=true
```

### 4. Database Setup
```bash
# Start PostgreSQL
brew services start postgresql  # macOS
sudo systemctl start postgresql  # Linux

# Create database
createdb arbitrage_detector

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma db push
```

### 5. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage Guide

### 🎯 Manual Arbitrage Detection
1. **Add Exchange Rates**: Use the form to input currency pairs and rates
2. **Configure Algorithm**: Adjust parameters (iterations, profit threshold, path length)
3. **Run Detection**: Click "Detekovat arbitráž" to find opportunities
4. **View Results**: Analyze detected cycles in the results section

### ⚡ Real-time Mode
1. **Enable Real-time**: Click "Real-time" button to start live detection
2. **Monitor Connection**: Watch the connection status indicator
3. **Receive Notifications**: Get alerts for high-profit opportunities (>1%)
4. **Track Performance**: Monitor statistics and success rates

### 📊 Data Management
- **CSV Import**: Upload exchange rate data in CSV format
- **Export Results**: Download arbitrage history as CSV
- **Clear Data**: Reset all data with one click

---

**Built with ❤️ for the crypto trading community**

*Happy Trading! 🚀*