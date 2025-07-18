# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a macOS desktop application for managing SUI testnet environments through a GUI interface. The application allows developers to start, stop, monitor, and configure SUI test networks without requiring command-line operations.

## Technology Stack

**Framework**: Electron + TypeScript
- Chosen for developer shareability, operational reliability, and rich ecosystem
- UI Library: React + Material-UI (or equivalent component library)
- Process Management: Node.js child_process for SUI command execution
- Configuration: JSON-based configuration file management

## Development Commands

Since this is a new project, typical Electron commands will be:
- `npm start` or `npm run dev` - Start development server
- `npm run build` - Build application for production
- `npm run electron` - Run Electron app
- `npm test` - Run tests
- `npm run lint` - Lint code
- `npm run type-check` - TypeScript type checking

## Key Architecture

The application implements these core features:

1. **Network Management**: Start/stop SUI test networks via child_process execution of `sui start`, `sui-test-validator`
2. **Real-time Monitoring**: Live display of network status, node count, block height, transaction processing
3. **Configuration Management**: GUI-based settings for ports, node count, initial balances with YAML/JSON file editing
4. **Profile System**: Multiple configuration profiles for different development scenarios
5. **Logging**: Comprehensive log viewing with filtering and export capabilities
6. **Installation Check**: Verify SUI testnet installation and validate source code paths
7. **Auto-update**: One-click SUI version updates with progress tracking
8. **Permission Management**: macOS permission handling with user-friendly dialogs
9. **Theme Support**: Dark/Light mode switching with system preference integration
10. **System Notifications**: macOS notification center integration for network status changes

## File Structure

Configuration files are stored in:
```
~/Library/Application Support/SUILocalnetManager/
├── config/
│   ├── app-settings.json          # Application settings
│   ├── profiles/                  # Network profiles
│   │   ├── default.json
│   │   ├── development.json
│   │   └── testing.json
│   └── sui-config/               # SUI configuration files
│       ├── client.yaml
│       └── network.yaml
├── logs/                         # Application logs
└── cache/                        # Temporary data & cache
```

## Key Implementation Areas

When working on this project, pay attention to:

1. **SUI Integration**: Execute SUI commands via child_process, parse stdout/stderr for monitoring
2. **Process Management**: Safely start/stop SUI network processes with proper cleanup
3. **Real-time Monitoring**: WebSocket-style updates from SUI process output parsing
4. **Configuration Persistence**: GUI editors for YAML/JSON files without exposing file system
5. **Error Handling**: Comprehensive error messages with actionable solutions
6. **Permission Flow**: macOS permission requests with clear explanations
7. **Theme System**: CSS-in-JS or CSS variables for dark/light mode switching
8. **Notification System**: Electron's notification API for system alerts

## Development Context

- Primary language: Japanese (with future multilingual support planned)
- Target platform: macOS (with potential cross-platform expansion)
- User base: Blockchain developers who prefer GUI over CLI
- Security focus: Proper permission handling, no external network dependencies
- Update mechanism: Built-in SUI version management