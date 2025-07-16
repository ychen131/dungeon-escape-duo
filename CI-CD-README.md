# CI/CD Setup for Dungeon Escape Duo

This document explains the Continuous Integration and Continuous Deployment (CI/CD) setup for the Dungeon Escape Duo multiplayer puzzle game.

## 🚀 Overview

Our CI/CD pipeline automatically runs on every pull request and push to the main branch, ensuring code quality, security, and functionality through comprehensive testing.

## 🏗️ Pipeline Structure

The GitHub Actions workflow (`.github/workflows/ci.yml`) consists of four main jobs:

### 1. **Test Job** 🧪

- **Matrix Testing**: Runs on Node.js 18.x and 20.x
- **Unit Tests**: Tests core game logic functions
- **Integration Tests**: Tests Socket.io multiplayer communication
- **Coverage Reports**: Generates test coverage reports
- **Linting**: Enforces code quality standards

### 2. **Security Job** 🔒

- **Dependency Audit**: Scans for known vulnerabilities
- **Production Dependencies**: Validates production-only dependencies
- **Security Level**: Fails on moderate+ severity issues

### 3. **Build Job** 🔨

- **Server Verification**: Ensures server can start successfully
- **Syntax Validation**: Checks for JavaScript syntax errors
- **Build Process**: Validates the build process

### 4. **Code Quality Job** ✨

- **Code Formatting**: Ensures consistent code style with Prettier
- **ESLint**: Advanced linting for code quality
- **Documentation**: Checks for TODO/FIXME comments

## 🧪 Testing Strategy

### Unit Tests (`tests/gameLogic.test.js`)

Tests isolated game logic functions:

- **Movement Validation**: Bounds checking, tile collision
- **Item Usage Logic**: Item effects on different tile types
- **Win Condition Logic**: Victory state detection
- **Player Management**: Connection handling, slot assignment
- **Turn Management**: Turn switching and validation
- **Tilemap Parsing**: Tilemap to game logic conversion
- **Game State Validation**: State structure and integrity

### Integration Tests (`tests/integration/socketio.integration.test.js`)

Tests real-time multiplayer functionality:

- **Connection Management**: Player assignment and connection handling
- **Game Mechanics**: Move requests and turn-based gameplay
- **Turn Management**: Proper turn alternation between players
- **Disconnection Handling**: Graceful disconnection management

### Security Tests (`tests/security/security.test.js`)

Tests security measures and input validation:

- **Input Validation**: Direction, item, and coordinate validation
- **Data Sanitization**: Socket message sanitization
- **Prototype Pollution Prevention**: Safe object merging
- **Rate Limiting**: Basic rate limiting implementation
- **Game State Security**: Sensitive information protection

## 🔧 Local Development

### Prerequisites

```bash
node >= 18.x
npm >= 8.x
```

### Setup

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests only
npm run test:integration

# Generate coverage report
npm run test:coverage

# Run linting
npm run lint

# Fix linting issues
npm run lint --fix

# Format code
npm run format

# Check formatting
npm run format:check
```

## 📋 Scripts Explained

| Script                     | Purpose                          | When to Use           |
| -------------------------- | -------------------------------- | --------------------- |
| `npm start`                | Start production server          | Production deployment |
| `npm run dev`              | Start with nodemon (auto-reload) | Development           |
| `npm test`                 | Run all tests                    | Before committing     |
| `npm run test:watch`       | Tests in watch mode              | Active development    |
| `npm run test:integration` | Integration tests only           | Socket.io testing     |
| `npm run test:coverage`    | Generate coverage report         | Coverage analysis     |
| `npm run lint`             | Lint and fix issues              | Code quality          |
| `npm run format`           | Format code with Prettier        | Code style            |

## 🎯 Quality Gates

The CI pipeline enforces several quality gates:

### ✅ Required Checks

- All tests must pass
- ESLint must pass with no errors
- Code coverage must be maintained
- No high-severity security vulnerabilities
- Server must start successfully
- Code must be properly formatted

### ⚠️ Warnings (Non-blocking)

- TODO/FIXME comments in code
- Moderate security vulnerabilities (reviewed case-by-case)

## 🔒 Security Measures

### Input Validation

- **Direction Validation**: Only allows `up`, `down`, `left`, `right`
- **Item Validation**: Only allows valid item types
- **Coordinate Validation**: Ensures integers within game bounds
- **Socket Data Sanitization**: Filters malicious payloads

### Security Scanning

- **npm audit**: Scans dependencies for vulnerabilities
- **Dependency Validation**: Ensures production dependencies are secure
- **Rate Limiting**: Prevents abuse of game actions

### Data Protection

- **Game State Filtering**: Each player only sees their own items
- **Sensitive Data**: Internal debug info never exposed to clients
- **Prototype Pollution**: Safe object merging prevents attacks

## 📊 Coverage Requirements

- **Unit Tests**: > 80% line coverage for game logic
- **Integration Tests**: Cover all Socket.io event handlers
- **Security Tests**: Cover all input validation functions

## 🚨 Common Issues and Solutions

### Test Failures

```bash
# If tests fail, check:
1. Dependencies installed: npm ci
2. Lint issues: npm run lint
3. Formatting: npm run format:check
4. Coverage: npm run test:coverage
```

### Security Audit Failures

```bash
# Fix security issues:
npm audit fix

# For manual review:
npm audit --audit-level moderate
```

### Build Failures

```bash
# Check syntax:
node -c server.js

# Verify server start:
timeout 10s npm start
```

## 🎮 Game-Specific Testing

### Multiplayer Testing

- Tests real Socket.io connections between two players
- Validates turn-based gameplay mechanics
- Ensures proper state synchronization
- Tests disconnection and reconnection scenarios

### Game Logic Testing

- Movement validation with different tile types
- Item usage mechanics (Douse Fire, Build Bridge)
- Win condition detection (both players on exit)
- Level progression and map loading

### Security Testing for Games

- Input validation for game commands
- Player state isolation
- Rate limiting for game actions
- Protection against cheating attempts

## 🔄 Continuous Improvement

### Adding New Tests

1. Create test file in appropriate directory (`tests/`)
2. Follow existing naming conventions (`*.test.js`)
3. Update test coverage requirements if needed
4. Document new test scenarios

### Updating CI Pipeline

1. Modify `.github/workflows/ci.yml`
2. Test changes on feature branch first
3. Update this README for significant changes
4. Monitor pipeline performance

## 📚 Resources

- [Jest Testing Framework](https://jestjs.io/)
- [Socket.io Testing](https://socket.io/docs/v4/testing/)
- [ESLint Configuration](https://eslint.org/docs/user-guide/configuring/)
- [Prettier Configuration](https://prettier.io/docs/en/configuration.html)
- [GitHub Actions](https://docs.github.com/en/actions)

## 🤝 Contributing

1. **Before Creating PR**:
   - Run full test suite: `npm test`
   - Check linting: `npm run lint`
   - Verify formatting: `npm run format:check`
   - Review security: `npm audit`

2. **PR Requirements**:
   - All CI checks must pass
   - Test coverage maintained or improved
   - Security vulnerabilities addressed
   - Code follows project standards

3. **Review Process**:
   - Automated checks run first
   - Manual code review
   - Game functionality testing
   - Security review for sensitive changes

---

**Happy coding! 🎮✨**
