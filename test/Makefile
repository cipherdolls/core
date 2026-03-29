PROJECT := core-test
COMPOSE := docker-compose.yaml
DC := docker compose -p $(PROJECT) -f $(COMPOSE)
TEST_CONTAINER := $(PROJECT)-bun
LOG_DIR := ./logs

SPEC ?= avatars

SERVICES := redis postgres foundry worker broker

SPECS := aiProviders auth avatars chatModels chats dollBodies dolls \
         embeddingModels messages transactions reasoningModels \
         scenarios sponsorships sttProviders tokenPermits ttsProviders ttsVoices firmwares pictures

# Max time in seconds to wait for tests before force-killing (default 10min)
TIMEOUT ?= 600

.PHONY: test test-all up down logs clean build help $(addprefix test-,$(SPECS))

define run_test
	bash -c '\
		set +e; \
		mkdir -p $(LOG_DIR); \
		echo "starting" > $(LOG_DIR)/$(1).status; \
		cleanup() { \
			echo ""; \
			echo "========== Cleaning up =========="; \
			docker rm -f $(TEST_CONTAINER) 2>/dev/null; \
			$(DC) kill 2>/dev/null; \
			$(DC) down -v --remove-orphans -t 0 2>/dev/null; \
		}; \
		trap cleanup EXIT; \
		echo "========== Starting services =========="; \
		$(DC) up -d --build --wait $(SERVICES); \
		echo "========== Running $(1) =========="; \
		$(DC) run -d --no-deps --build --name $(TEST_CONTAINER) bun \
			bun test --timeout 30000 ./test/$(1).e2e-spec.ts; \
		echo "running" > $(LOG_DIR)/$(1).status; \
		\
		docker wait $(TEST_CONTAINER) &>/dev/null & \
		WAIT_PID=$$!; \
		stdbuf -oL docker logs -f $(TEST_CONTAINER) 2>&1 \
			| stdbuf -oL sed "s/\x1b\[[0-9;]*m//g" \
			> $(LOG_DIR)/$(1).log & \
		LOGS_PID=$$!; \
		\
		if ! timeout $(TIMEOUT) tail --pid=$$WAIT_PID -f /dev/null 2>/dev/null; then \
			echo "========== TIMEOUT after $(TIMEOUT)s =========="; \
			docker kill $(TEST_CONTAINER) 2>/dev/null; \
			echo "timeout" > $(LOG_DIR)/$(1).status; \
		fi; \
		wait $$WAIT_PID 2>/dev/null; \
		rc=$$(docker inspect -f "{{.State.ExitCode}}" $(TEST_CONTAINER) 2>/dev/null || echo 1); \
		kill $$LOGS_PID 2>/dev/null; \
		wait $$LOGS_PID 2>/dev/null; \
		if [ "$$(cat $(LOG_DIR)/$(1).status)" != "timeout" ]; then \
			echo "exit:$$rc" > $(LOG_DIR)/$(1).status; \
		fi; \
		echo "========== Tests finished (rc=$$rc) — log: $(LOG_DIR)/$(1).log =========="; \
		exit $$rc'
endef

test:
	$(call run_test,$(SPEC))

test-all:
	@failed=""; \
	for spec in $(SPECS); do \
		echo ""; \
		echo "========== Suite: $$spec =========="; \
		$(MAKE) --no-print-directory test SPEC=$$spec; \
		if [ $$? -ne 0 ]; then failed="$$failed $$spec"; fi; \
	done; \
	if [ -n "$$failed" ]; then \
		echo ""; \
		echo "Failed specs:$$failed"; exit 1; \
	else \
		echo ""; \
		echo "All specs passed"; \
	fi

up:
	$(DC) up

down:
	$(DC) kill 2>/dev/null || true
	$(DC) down -v --remove-orphans -t 0

logs:
	$(DC) logs -f

build:
	$(DC) build

clean:
	$(DC) kill 2>/dev/null || true
	$(DC) down -v --remove-orphans --rmi local -t 0
	@docker ps -aq --filter "label=com.docker.compose.project=$(PROJECT)" | xargs -r docker rm -f 2>/dev/null || true
	@docker volume ls -q --filter "label=com.docker.compose.project=$(PROJECT)" | xargs -r docker volume rm -f 2>/dev/null || true
	@docker network ls -q --filter "label=com.docker.compose.project=$(PROJECT)" | xargs -r docker network rm 2>/dev/null || true

$(addprefix test-,$(SPECS)):
	$(call run_test,$(subst test-,,$@))

help:
	@echo "Usage:"
	@echo "  make test SPEC=auth       Run a single test spec"
	@echo "  make test SPEC=auth TIMEOUT=300"
	@echo "  make test-avatars         Run avatars test spec"
	@echo "  make test-all             Run all test specs sequentially"
	@echo "  make up                   Start test services"
	@echo "  make down                 Stop and clean up test services"
	@echo "  make build                Build images"
	@echo "  make logs                 Tail logs"
	@echo "  make clean                Nuclear cleanup"
	@echo ""
	@echo "Available specs:"
	@echo "  $(SPECS)" | fold -s -w 70
