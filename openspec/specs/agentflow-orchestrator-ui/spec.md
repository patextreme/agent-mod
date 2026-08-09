# Agentflow Orchestrator Ui Specification

## Purpose

Presents a blocking flow run as a live, navigable full-screen orchestrator so the user can observe every running sub-agent and tap into any of them — viewing, steering, or stopping an agent mid-run — while the flow executes.

## Requirements

### Requirement: Blocking full-screen orchestrator
When a flow is invoked in TUI mode, the system SHALL run the flow inside a modal full-screen Orchestrator component (`ctx.ui.custom()`) that stays open for the duration of the run. The invocation SHALL not resolve until the flow completes. When the run ends, the Orchestrator SHALL close and the main session editor is restored.

#### Scenario: Orchestrator owns the screen during a run
- **WHEN** a flow is invoked in TUI mode
- **THEN** a full-screen Orchestrator replaces the editor until the flow completes, then the editor is restored

### Requirement: Live agent overview
The Orchestrator SHALL render a live list of the main session plus every running flow-agent, showing for each agent its name, current status, model, running time, and a summary of its current activity (current step or tool). The list SHALL update as the underlying sub-agents stream events.

#### Scenario: Running agents are listed with live status
- **WHEN** a flow has multiple running sub-agents
- **THEN** the Orchestrator lists each with live status, model, elapsed time, and current activity that updates as events stream

### Requirement: Streamed progress logs
`af.log(...)` calls from the running script SHALL render as progress lines inside the Orchestrator as they occur.

#### Scenario: Log line streams into the Orchestrator
- **WHEN** a running script calls `af.log("Starting step 1")`
- **THEN** the line "Starting step 1" appears in the Orchestrator

### Requirement: Tap into a running agent
The user SHALL be able to select any listed running agent and open a live, auto-updating conversation viewer for it. The user SHALL be able to return to the agent list.

#### Scenario: Open and view a running agent's conversation
- **WHEN** the user selects a running agent in the Orchestrator and requests to open it
- **THEN** a conversation viewer opens showing that agent's live, auto-updating conversation, and the user can return to the list

### Requirement: Steer a running agent
The user SHALL be able to send a steering message to a selected running agent from within the Orchestrator, which is delivered to that agent and redirects its current work.

#### Scenario: Steer a running agent
- **WHEN** the user opens a running agent and submits a steering message
- **THEN** the message is delivered to that agent as a user message redirecting its work

### Requirement: Stop a running agent
The user SHALL be able to request a stop of a selected running agent, which aborts that agent's current run. The stop SHALL require confirmation unless the agent is already stopped.

#### Scenario: Stop a running agent
- **WHEN** the user requests to stop a running agent and confirms
- **THEN** the agent's run is aborted and its status reflects the stopped state

### Requirement: Non-TUI mode behavior
When a flow is invoked outside TUI mode, the system SHALL run the flow without the interactive Orchestrator, still executing the script and delivering the result, and SHALL surface errors appropriately.

#### Scenario: Run without TUI
- **WHEN** a flow is invoked in a non-TUI mode (print, RPC, JSON)
- **THEN** the script executes and the result is delivered without an interactive Orchestrator