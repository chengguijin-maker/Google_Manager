.PHONY: help install dev build run clean test

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

install: ## Install all dependencies (Python venv + backend + frontend)
	@echo "$(CYAN)Creating Python virtual environment...$(RESET)"
	python3 -m venv venv
	@echo "$(CYAN)Installing backend dependencies...$(RESET)"
	./venv/bin/pip install --upgrade pip
	./venv/bin/pip install -r requirements.txt
	@echo "$(CYAN)Installing frontend dependencies...$(RESET)"
	cd frontend && npm install
	@echo "$(GREEN)Installation complete!$(RESET)"

dev: ## Start both frontend and backend development servers
	@echo "$(CYAN)Starting development servers...$(RESET)"
	@echo "$(YELLOW)Backend: http://localhost:8002$(RESET)"
	@echo "$(YELLOW)Frontend: http://localhost:5173$(RESET)"
	@echo "$(YELLOW)Press Ctrl+C to stop both servers$(RESET)"
	@echo ""
	@trap 'kill 0' SIGINT; \
	./venv/bin/python run.py & \
	cd frontend && npm run dev & \
	wait

build: ## Build frontend for production
	@echo "$(CYAN)Building frontend...$(RESET)"
	cd frontend && npm run build
	@echo "$(GREEN)Build complete! Output in frontend/dist/$(RESET)"

run: ## Start backend server only
	@echo "$(CYAN)Starting backend server on http://localhost:8002...$(RESET)"
	./venv/bin/python run.py

clean: ## Clean dependencies and build artifacts
	@echo "$(CYAN)Cleaning project...$(RESET)"
	rm -rf venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	@echo "$(GREEN)Clean complete!$(RESET)"

test: ## Run tests (placeholder for future implementation)
	@echo "$(YELLOW)Test command not yet implemented$(RESET)"
