from typing import Any, Dict, List

def detect_patterns(steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyzes execution steps to detect programming patterns:
      - Accumulation (summing/reduction)
      - Counter (stepping by constant increments/decrements)
      - Min/Max Search (updating variables inside comparison conditionals)
      - Nested Loops (nested execution scopes)
    """
    patterns = []
    signals = []
    
    # 1. Track variables changes & differences
    var_history: Dict[str, List[Any]] = {}
    
    conditional_updates = {} # var -> list of steps where updated under conditional
    
    for step in steps:
        step_kind = step.get("kind", "")
        # Loop mechanism updates (init/step) are not conditional body updates
        is_loop_mechanic = step_kind in ("loop-init", "loop-step")
        
        # Track variable history
        variables = step.get("state", {}).get("variables", step.get("variables", {}))
        for name, val in variables.items():
            if name not in var_history:
                var_history[name] = []
            if not var_history[name] or var_history[name][-1] != val:
                var_history[name].append(val)
                
                # Check if this change happened directly after a conditional step
                # (Look at the immediately preceding step)
                if len(steps) > 1 and not is_loop_mechanic:
                    try:
                        step_idx = steps.index(step)
                        if step_idx > 0:
                            prev_step = steps[step_idx - 1]
                            if "condition" in prev_step and prev_step.get("condition_result") is True:
                                if name not in conditional_updates:
                                    conditional_updates[name] = []
                                conditional_updates[name].append(prev_step.get("condition"))
                    except ValueError:
                        pass

    # Analyze patterns from histories
    for name, history in var_history.items():
        if len(history) < 2:
            continue
            
        # Try to parse numeric changes
        numeric_diffs = []
        is_numeric = True
        for i in range(1, len(history)):
            try:
                prev_val = float(history[i-1])
                curr_val = float(history[i])
                numeric_diffs.append(curr_val - prev_val)
            except (ValueError, TypeError):
                is_numeric = False
                break

        # Booleans are handled by the flag/toggle pattern below, not numeric ones
        if all(isinstance(v, bool) for v in history):
            is_numeric = False
                
        if is_numeric and numeric_diffs:
            # Check if it is a Counter (constant increment/decrement, e.g. +1 or -1)
            all_same_diff = all(diff == numeric_diffs[0] for diff in numeric_diffs)
            if all_same_diff and abs(numeric_diffs[0]) in (1, 2):
                patterns.append({
                    "name": "Counter",
                    "variable": name,
                    "description": f"Variable '{name}' acts as a counter, incrementing/decrementing by {int(numeric_diffs[0])} consistently."
                })
                signals.append(f"consistently updating '{name}' by {int(numeric_diffs[0])}")
            else:
                # Accumulator: values change, but not always by the same small constant
                patterns.append({
                    "name": "Accumulation",
                    "variable": name,
                    "description": f"Variable '{name}' acts as an accumulator, summing or accumulating values over loop iterations."
                })
                signals.append(f"accumulating changes into '{name}'")
                
        # Check Min/Max Search: variable updated inside comparison conditionals
        # Only when the condition actually references this variable.
        if name in conditional_updates:
            conds = conditional_updates[name]
            has_comparison = any(
                name in cond and any(op in cond for op in (">", "<", ">=", "<="))
                for cond in conds
            )
            if has_comparison:
                patterns.append({
                    "name": "Min/Max Search",
                    "variable": name,
                    "description": f"Variable '{name}' is updated conditionally based on value comparisons (tracking minimum/maximum)."
                })
                signals.append(f"updating '{name}' under comparison checks")

        # Boolean Flag / Toggle: boolean that flips between true/false repeatedly
        bool_history = [v for v in history if isinstance(v, bool)]
        if (
            len(bool_history) >= 2
            and bool_history != list(set(bool_history))
            and len(bool_history) >= 3
        ):
            patterns.append({
                "name": "Boolean Flag / Toggle",
                "variable": name,
                "description": f"Boolean variable '{name}' toggles between true/false, commonly used as a flag to switch behavior or stop a loop."
            })
            signals.append(f"toggling '{name}' between true/false")

        # String Concatenation Accumulator: non-numeric values that keep growing
        string_history = [v for v in history if isinstance(v, str)]
        if (
            len(string_history) >= 3
            and all(
                len(a) < len(b)
                for a, b in zip(string_history, string_history[1:])
            )
        ):
            patterns.append({
                "name": "String Accumulation",
                "variable": name,
                "description": f"String variable '{name}' grows over each iteration by concatenation (e.g. building output)."
            })
            signals.append(f"accumulating string changes into '{name}'")

    # Swap/Exchange: two variables exchange their values via a temp variable
    # (history of A starts with B's final value and ends with B's initial value,
    # or a single step has both updated to each other's old values).
    swap_names = set()
    for step in steps:
        changes = step.get("changes", [])
        updates = [c for c in changes if isinstance(c, dict) and c.get("type") == "update"]
        if len(updates) >= 2:
            for i in range(len(updates)):
                for j in range(i + 1, len(updates)):
                    a, b = updates[i], updates[j]
                    if (
                        a.get("var") != b.get("var")
                        and a.get("old") == b.get("new")
                        and a.get("new") == b.get("old")
                    ):
                        swap_names.add((a["var"], b["var"]))
    # Also detect the temp-variable pattern from value histories
    hist_items = [(n, h) for n, h in var_history.items() if len(h) >= 2]
    for i in range(len(hist_items)):
        for j in range(i + 1, len(hist_items)):
            n1, h1 = hist_items[i]
            n2, h2 = hist_items[j]
            if (
                h1[0] == h2[-1]
                and h1[-1] == h2[0]
                and h1[0] != h1[-1]
            ):
                swap_names.add((n1, n2))

    for a, b in swap_names:
        patterns.append({
            "name": "Swap / Exchange",
            "description": f"Variables '{a}' and '{b}' exchange their values, a common step in sorting and rearranging data."
        })
        signals.append("exchanging values between variables")

    # Check Nested Loops
    # Authoritative: generated steps carry control.loop_depth.
    max_loop_depth = 0
    if any(step.get("control", {}).get("loop_depth") is not None for step in steps):
        max_loop_depth = max(
            (step.get("control", {}).get("loop_depth", 0) for step in steps),
            default=0,
        )
    else:
        # Legacy fallback: infer nesting from the step kind sequence.
        depth = 0
        for step in steps:
            kind = step.get("kind")
            if kind == "loop-init":
                depth += 1
                max_loop_depth = max(max_loop_depth, depth)
            elif kind == "condition" and step.get("condition_result") is False:
                depth = max(0, depth - 1)

    if max_loop_depth > 1:
        patterns.append({
            "name": "Nested Loops",
            "description": f"Code contains nested loops (depth {max_loop_depth}), which increases execution time complexity."
        })
        signals.append("nested iteration execution blocks")

    # Unique patterns
    unique_patterns = []
    seen_names = set()
    for p in patterns:
        pkey = (p.get("name"), p.get("variable"))
        if pkey not in seen_names:
            seen_names.add(pkey)
            unique_patterns.append(p)

    return {
        "patterns": unique_patterns,
        "signals": list(set(signals))
    }
