class_name AgentRoutes
extends RefCounted
## The hook through which agents can follow fixed routes instead of turning at random (decision
## G-214): bus routes from the transit network (`RouteBuses` in `src/transit`). `AgentSystem`
## asks it, when it is set, at the few points where a route changes what an agent does: being
## put on the map, choosing the next stretch at a junction, slowing for a stop, keeping to the
## kerb, and staying out while it serves a stop. This base class changes nothing (every agent
## drives as before), so `AgentSystem` without routes behaves exactly as it did.
##
## Called on the AI thread inside `AgentSystem.update` and its placing; pure logic, no nodes.


## Before each update: a chance to re-place agents (a bus sent towards the player's stop).
func before_update(_system: AgentSystem, _focus: Vector2) -> void:
	pass


## Whether this agent should be out whatever the pool's count says (a route bus in service).
func wants_out(_system: AgentSystem, _a: AgentSystem.Agent) -> bool:
	return false


## Put the agent on a route near the focus (with `AgentSystem.put_on`). False: place it as usual.
func place(_system: AgentSystem, _a: AgentSystem.Agent, _focus: Vector2) -> bool:
	return false


## The agent was placed by the usual rule (not on a route): forget any route it had.
func placed_freely(_a: AgentSystem.Agent) -> void:
	pass


## The stretch to take after `a.edge` (the agent has just moved onto it), or -2 for "no route:
## choose as usual". Returning `a.edge` itself ends the trip: the agent is re-placed.
func next_edge(_system: AgentSystem, _a: AgentSystem.Agent) -> int:
	return -2


## Metres ahead of the agent's middle to where it must stand still (a stop), or INF. `dt` lets the
## route count the time it has stood there.
func stop_room(_system: AgentSystem, _a: AgentSystem.Agent, _dt: float) -> float:
	return INF


## 0..1: how far over to the kerb the agent keeps (1 = as for a siren), e.g. at a stop.
func kerb(_a: AgentSystem.Agent) -> float:
	return 0.0


## True while the agent must not be recycled or put away (standing at a stop, carrying the player).
func keeps(_a: AgentSystem.Agent) -> bool:
	return false
