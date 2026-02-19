# DevCopilot (Devkit) - Project Guide

## Overview
**DevCopilot** is an AI-powered developer productivity platform that autonomously monitors engineering workflows across GitHub/GitLab, Slack, Linear/Jira, and Sentry. Built on Metorial's MCP infrastructure and Claude Sonnet 4.5. Primary interface is Slack with a web dashboard.

## Architecture
- **Event-Driven Pipeline:** External Event → Webhook → Event Queue → Event Processor → AI Orchestrator (Claude) → Decision Engine → Action Executor (Metorial MCP) → External Systems → Activity Logger
- **Infrastructure:** AWS multi-region, Python 3.14
- **Security:** OAuth 2.0, JWT, AES-256, TLS 1.3, Metorial Secret Vault

## Core Workflows
1. **PR Review Acceleration** - AI-generated PR summaries, smart reviewer notifications
2. **Error-to-Resolution Pipeline** - Sentry errors auto-triaged into tickets
3. **Ticket Lifecycle Automation** - Auto status updates across pipeline
4. **Engineering Intelligence** - Automated weekly reports and metrics

## Integrations (MVP)
- GitHub, GitLab, Slack, Linear, Jira, Sentry
- Phase 2: PagerDuty, Opsgenie

## Project Structure
```
Devkit/
├── app/
│   └── main.py          # Application entry point
├── idea.md              # Full product vision and description
├── .env                 # Environment configuration
├── venv/                # Python 3.14 virtual environment
└── openmemory.md        # This file
```

## Components
- (To be populated as components are built)

## Patterns
- (To be populated as patterns emerge)

## User Defined Namespaces
- [Leave blank - user populates]
