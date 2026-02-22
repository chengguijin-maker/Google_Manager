.PHONY: help install dev build clean test test-server rust-check rust-check-test-server

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RESET := \033[0m

help: ## Display this help message
	@echo "$(CYAN)Google Manager - Available Commands$(RESET)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(RESET) %s\n", $$1, $$2}'
	@echo ""

install: ## Install frontend dependencies
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd frontend && pnpm install
	@echo "$(GREEN)Installation complete!$(RESET)"

dev: ## Start Tauri development mode
	@echo "$(CYAN)Starting Tauri dev mode...$(RESET)"
	cd src-tauri && cargo tauri dev

build: ## Build frontend for production
	@echo "$(CYAN)Building frontend...$(RESET)"
	cd frontend && pnpm run build
	@echo "$(GREEN)Build complete!$(RESET)"

test-server: ## Start Rust HTTP test server on port 3001 (without GUI dependencies)
	@echo "$(CYAN)Starting Rust HTTP test server on http://localhost:3001 (skip GUI dependency compilation)...$(RESET)"
	cd src-tauri && cargo run --no-default-features --features test-server -- --test-server --port 3001

rust-check: ## Quick Rust compile check (desktop default features)
	@echo "$(CYAN)Running cargo check (quick)...$(RESET)"
	cd src-tauri && cargo check

rust-check-test-server: ## Rust compile check with HTTP test-server feature
	@echo "$(CYAN)Running cargo check with test-server feature...$(RESET)"
	cd src-tauri && cargo check --no-default-features --features test-server

clean: ## Clean dependencies and build artifacts
	@echo "$(CYAN)Cleaning project...$(RESET)"
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	@echo "$(GREEN)Clean complete!$(RESET)"

test: ## Run all unit tests
	@echo "$(CYAN)Running unit tests...$(RESET)"
	pnpm run test:parallel:acceptance
