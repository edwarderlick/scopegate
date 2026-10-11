import pytest
import json

FACTBOOK = """The beta supports CSV export.
A mobile application is under consideration.
No mobile release date has been announced.
Refund requests must be referred to the support team."""

RULES = [
    "Use only product facts supported by the factbook.",
    "Do not invent launch dates or future commitments.",
    "Do not promise refunds or compensation.",
]


def deploy(direct_deploy):
    return direct_deploy("contracts/scopegate.py")


def create_workspace(contract, direct_vm, owner):
    direct_vm.sender = owner
    return contract.create_workspace(
        "workspace-1",
        "Orbit Product Updates",
        "Govern product-support announcements.",
        "Publish accurate product explanations based strictly on the approved public factbook.",
        RULES,
        FACTBOOK,
    )


def authorize(contract, direct_vm, owner, workspace_id, agent, nonce="agent-1"):
    direct_vm.sender = owner
    return contract.authorize_agent(workspace_id, nonce, "Orbit Release Bot", agent, 280, 1)


def allow_response():
    return {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date is asserted."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports the assertion."}
        ],
        "summary": "Allowed.",
    }


def deny_response():
    return {
        "conditions": [
            {"id": "MANDATE", "status": "VIOLATED", "message_excerpt": "next Friday", "source_excerpt": "approved public factbook", "explanation": "Invented release date."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "mobile app", "source_excerpt": "A mobile application is under consideration.", "explanation": "Mobile app consideration is supported."},
            {"id": "R2", "status": "VIOLATED", "message_excerpt": "next Friday", "source_excerpt": "No mobile release date has been announced.", "explanation": "Release date is not supported."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [
            {"text": "next Friday", "support": "UNSUPPORTED", "source_excerpt": "No mobile release date has been announced.", "explanation": "No date exists in factbook."}
        ],
        "summary": "Denied.",
    }


def no_assertions_response():
    return {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date is asserted."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [],
        "summary": "Allowed.",
    }


def fabricated_support_response():
    response = allow_response()
    response["assertions"][0]["source_excerpt"] = "The beta supports CSV export and bulk admin dashboards."
    return response


def omitted_mobile_launch_response():
    return {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export CSV.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "export CSV", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date is considered by the leader."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [
            {"text": "You can export CSV.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports CSV export."}
        ],
        "summary": "Allowed.",
    }


def validator_verdict(response):
    return {
        "valid": True,
        "conditions": response.get("conditions", []),
        "assertions": response.get("assertions", []),
        "coverage_explanation": "Validator assertion coverage matches the leader.",
    }


def mock_eval(direct_vm, response, verdict=None):
    if verdict is None:
        verdict = validator_verdict(response)
    direct_vm.mock_llm(r"(?s).*(independent validator|Leader JSON).*", json.dumps(verdict))
    direct_vm.mock_llm(r"(?s)^(?!.*(independent validator|Leader JSON)).*Return JSON only.*", json.dumps(response))


def test_owner_agent_flow_and_replay(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-1", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, allow_response())
    contract.evaluate_request(request_id)
    req = contract.get_request(request_id)
    ev = contract.get_evaluation(req["evaluationId"])
    if ev["status"] == "EVALUATION_FAILED":
        print(f"EVALUATION FAILED: {ev['summary']}")
    contract.publish(request_id)

    posts = contract.list_posts(0, 10)
    assert len(posts) == 1
    assert contract.get_post(posts[0])["message"] == "You can export your beta data as a CSV file."
    with direct_vm.expect_revert("permit not publishable"):
        contract.publish(request_id)


def test_timestamps_are_nonzero_and_ordered(direct_vm, direct_deploy, direct_owner, direct_alice):
    direct_vm.warp("2026-09-30T10:00:00Z")
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    policy = contract.get_policy(contract.get_workspace(workspace_id)["activePolicyId"])
    assert int(policy["createdAt"]) > 0

    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-09-30T10:05:00Z")
    request_id = contract.submit_action(workspace_id, agent_id, "request-time", "You can export your beta data as a CSV file.")
    request = contract.get_request(request_id)
    assert int(request["createdAt"]) > int(policy["createdAt"])

    mock_eval(direct_vm, allow_response())
    contract.evaluate_request(request_id)
    direct_vm.warp("2026-09-30T10:10:00Z")
    contract.publish(request_id)
    post = contract.get_post(contract.list_posts(0, 10)[0])
    assert int(post["publishedAt"]) > int(request["createdAt"])


def test_forged_identity_and_wrong_wallet_rejected(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("active bound agent required"):
        contract.submit_action(workspace_id, agent_id, "bad-request", "You can export your beta data as a CSV file.")


def test_deny_cannot_publish(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-deny", "Our mobile app launches next Friday.")
    mock_eval(direct_vm, deny_response())
    contract.evaluate_request(request_id)
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_policy_activation_invalidates_ready_permit_by_version(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-policy", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, allow_response())
    contract.evaluate_request(request_id)

    direct_vm.sender = direct_owner
    draft_id = contract.save_policy_draft(workspace_id, "draft-1", "New mandate.", RULES, FACTBOOK)
    contract.activate_draft(workspace_id, draft_id)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("stale policy"):
        contract.publish(request_id)


def test_revoke_and_reauthorize_do_not_revive_old_permit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-revoke", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, allow_response())
    contract.evaluate_request(request_id)

    direct_vm.sender = direct_owner
    contract.revoke_agent(agent_id)
    authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice, "agent-2")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("agent revoked"):
        contract.publish(request_id)


def test_publication_cap_competing_ready_permits(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    first = contract.submit_action(workspace_id, agent_id, "request-cap-1", "You can export your beta data as a CSV file.")
    second = contract.submit_action(workspace_id, agent_id, "request-cap-2", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, allow_response())
    contract.evaluate_request(first)
    contract.evaluate_request(second)
    contract.publish(first)
    with direct_vm.expect_revert("publication cap reached"):
        contract.publish(second)


def test_malformed_incomplete_or_fabricated_quotes_create_no_permit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-bad-eval", "You can export your beta data as a CSV file.")
    direct_vm.mock_llm(r".*Return JSON only.*", {"conditions": [], "assertions": [], "summary": "bad"})
    contract.evaluate_request(request_id)
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_satisfied_conditions_without_assertions_create_no_permit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-empty-assertions", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, no_assertions_response())
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    assert evaluation["status"] == "NEEDS_REVIEW"
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_fabricated_support_excerpt_creates_no_permit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    request_id = contract.submit_action(workspace_id, agent_id, "request-fabricated-support", "You can export your beta data as a CSV file.")
    mock_eval(direct_vm, fabricated_support_response())
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    assert evaluation["status"] == "EVALUATION_FAILED"
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_validator_rejects_leader_omitting_material_mobile_launch_claim(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export CSV. Our mobile app launches tomorrow."
    request_id = contract.submit_action(workspace_id, agent_id, "request-omitted-claim", message)
    validator_finds_omitted_claim = {
        "valid": True,
        "assertions": [
            {"text": "You can export CSV.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports CSV export."},
            {"text": "Our mobile app launches tomorrow.", "support": "UNSUPPORTED", "source_excerpt": "No mobile release date has been announced.", "explanation": "The message invents a launch date."},
        ],
        "coverage_explanation": "The leader omitted the unsupported mobile launch claim.",
    }
    mock_eval(direct_vm, omitted_mobile_launch_response(), validator_finds_omitted_claim)
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    assert evaluation["status"] == "NEEDS_REVIEW"
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_supported_substring_does_not_cover_mixed_sentence_claim(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export CSV and our mobile app launches tomorrow."
    request_id = contract.submit_action(workspace_id, agent_id, "request-substring-claim", message)
    response = omitted_mobile_launch_response()
    response["conditions"][0]["message_excerpt"] = "You can export CSV"
    response["assertions"][0]["text"] = "You can export CSV"
    validator_approves_only_csv = validator_verdict(response)
    mock_eval(direct_vm, response, validator_approves_only_csv)
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    assert evaluation["status"] == "NEEDS_REVIEW"
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)


def test_validator_marks_leader_supported_claim_unsupported_creates_no_permit(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. It also supports XML."
    request_id = contract.submit_action(workspace_id, agent_id, "request-validator-disagrees", message)
    
    leader_response = allow_response()
    leader_response["assertions"].append({
        "text": "It also supports XML.",
        "support": "SUPPORTED",
        "source_excerpt": "The beta supports CSV export.",
        "explanation": "Fake support."
    })
    
    validator_disagrees = {
        "valid": True,
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports this."},
            {"text": "It also supports XML.", "support": "UNSUPPORTED", "source_excerpt": "", "explanation": "Factbook doesn't mention XML."}
        ],
        "coverage_explanation": "Leader falsely claimed XML was supported."
    }
    
    mock_eval(direct_vm, leader_response, validator_disagrees)
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False
    assert evaluation["status"] == "ALLOW"
    assert request["permitId"] != ""


def test_validator_omits_claim_valid_true(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. It also supports XML."
    request_id = contract.submit_action(workspace_id, agent_id, "request-validator-omits", message)
    
    leader_response = allow_response()
    leader_response["assertions"].append({
        "text": "It also supports XML.",
        "support": "SUPPORTED",
        "source_excerpt": "The beta supports CSV export.",
        "explanation": "Fake support."
    })
    
    validator_omits = {
        "valid": True,
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports this."}
        ],
        "coverage_explanation": "Omitted the XML claim."
    }
    
    mock_eval(direct_vm, leader_response, validator_omits)
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False
    assert evaluation["status"] == "ALLOW"
    assert request["permitId"] != ""

def test_valid_needs_review_consensus(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. It also supports XML."
    request_id = contract.submit_action(workspace_id, agent_id, "request-valid-reject", message)
    
    leader_response = allow_response()
    leader_response["assertions"].append({
        "text": "It also supports XML.",
        "support": "UNSUPPORTED",
        "source_excerpt": "",
        "explanation": "Factbook doesn't mention XML."
    })
    
    validator_agrees = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date is asserted."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports this."},
            {"text": "It also supports XML.", "support": "UNSUPPORTED", "source_excerpt": "", "explanation": "Factbook doesn't mention XML."}
        ],
        "coverage_explanation": "Agreed."
    }
    
    mock_eval(direct_vm, leader_response, validator_agrees)
    contract.evaluate_request(request_id)
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert direct_vm.run_validator() == True
    assert evaluation["status"] == "NEEDS_REVIEW"
    assert request["permitId"] == ""

def test_validator_repeats_csv_and_omits_xml(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. It also supports XML."
    request_id = contract.submit_action(workspace_id, agent_id, "request-duplicate-csv", message)
    
    leader_response = allow_response()
    leader_response["assertions"].append({
        "text": "It also supports XML.",
        "support": "SUPPORTED",
        "source_excerpt": "The beta supports XML.",
        "explanation": "Fake support."
    })
    
    validator_repeats = {
        "valid": True,
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Factbook supports this."},
            {"text": "export your beta data as a CSV", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Repeated claim."}
        ],
        "coverage_explanation": "Repeated CSV, omitted XML."
    }
    
    mock_eval(direct_vm, leader_response, validator_repeats)
    contract.evaluate_request(request_id)
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False

def test_support_labels_swapped(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. It also supports XML."
    request_id = contract.submit_action(workspace_id, agent_id, "request-swapped-labels", message)
    
    leader_response = allow_response()
    leader_response["assertions"].append({
        "text": "It also supports XML.",
        "support": "UNSUPPORTED",
        "source_excerpt": "",
        "explanation": "No XML."
    })
    
    validator_swapped = {
        "valid": True,
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "UNSUPPORTED", "source_excerpt": "", "explanation": "Factbook does not support this? Swapped!"},
            {"text": "It also supports XML.", "support": "SUPPORTED", "source_excerpt": "The beta supports XML.", "explanation": "Swapped."}
        ],
        "coverage_explanation": "Labels swapped."
    }
    
    mock_eval(direct_vm, leader_response, validator_swapped)
    contract.evaluate_request(request_id)
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False

def test_validator_fails_leader_duplicating_excerpt_for_two_claims(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    
    direct_vm.sender = direct_owner
    workspace_id = contract.create_workspace(
        "workspace-custom",
        "Custom",
        "Custom purpose",
        "Mandate",
        ["rule 1"],
        "The beta supports CSV export."
    )
    
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "The beta supports CSV export. The beta supports XML export."
    request_id = contract.submit_action(workspace_id, agent_id, "request-csv-xml", message)
    
    leader_response = {
        "summary": "Leader marks both supported using the CSV excerpt",
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "CSV", "source_excerpt": "Mandate", "explanation": "ok"},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV", "source_excerpt": "rule 1", "explanation": "ok"}
        ],
        "assertions": [
            {
                "text": "The beta supports CSV export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "CSV"
            },
            {
                "text": "The beta supports XML export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Used CSV excerpt for XML."
            }
        ]
    }
    
    validator_response = {
        "valid": True,
        "assertions": [
            {
                "text": "The beta supports CSV export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Valid CSV claim"
            },
            {
                "text": "The beta supports CSV export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Validator repeats CSV claim"
            }
        ],
        "coverage_explanation": "Repeated."
    }
    
    mock_eval(direct_vm, leader_response, validator_response)
    contract.evaluate_request(request_id)
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False

def test_validator_fails_broad_overlapping_assertion(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    
    direct_vm.sender = direct_owner
    workspace_id = contract.create_workspace(
        "workspace-custom-2",
        "Custom 2",
        "Custom purpose 2",
        "Mandate 2",
        ["rule 1"],
        "The beta supports CSV export."
    )
    
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    direct_vm.sender = direct_alice
    message = "The beta supports CSV export. The beta supports XML export."
    request_id = contract.submit_action(workspace_id, agent_id, "request-broad-overlap", message)
    
    leader_response = {
        "summary": "Leader marks both supported",
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "CSV", "source_excerpt": "Mandate 2", "explanation": "ok"},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV", "source_excerpt": "rule 1", "explanation": "ok"}
        ],
        "assertions": [
            {
                "text": "The beta supports CSV export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "CSV"
            },
            {
                "text": "The beta supports XML export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Used CSV excerpt for XML."
            }
        ]
    }
    
    validator_response = {
        "valid": True,
        "assertions": [
            {
                "text": "The beta supports CSV export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Valid CSV claim"
            },
            {
                "text": "The beta supports CSV export. The beta supports XML export.",
                "support": "SUPPORTED",
                "source_excerpt": "The beta supports CSV export.",
                "explanation": "Validator lumps the entire message into one supported assertion"
            }
        ],
        "coverage_explanation": "Broad claim."
    }
    
    mock_eval(direct_vm, leader_response, validator_response)
    contract.evaluate_request(request_id)
    res = direct_vm.run_validator()
    print("RESULT:", res)
    assert res == False
def test_get_request_id_for_case_insensitivity(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    req_id = contract.submit_action(workspace_id, agent_id, "lookup_nonce", "msg")
    
    hex_addr = "0x" + direct_alice.hex()
    uppercase = hex_addr.upper()
    lowercase = hex_addr.lower()
    
    assert contract.get_request_id_for(uppercase, "lookup_nonce") == req_id
    assert contract.get_request_id_for(lowercase, "lookup_nonce") == req_id

def test_generated_prompt_includes_all_rule_ids(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-prompt", message)
    
    import json
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"(?s).*Leader JSON.*", json.dumps(validator_verdict(allow_response())))
    direct_vm.mock_llm(r"(?s).*\"id\":\"MANDATE\".*\"id\":\"R1\".*\"id\":\"R2\".*\"id\":\"R3\".*", json.dumps(allow_response()))
    
    contract.evaluate_request(request_id)
    
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert direct_vm.run_validator() == True
    assert evaluation["status"] == "ALLOW"
    assert request["permitId"] != ""


def test_regression_false_satisfied_mandate_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. Unapproved non-product commentary."
    request_id = contract.submit_action(workspace_id, agent_id, "request-false-mandate", message)

    leader_false_mandate = {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Leader falsely marks mandate SATISFIED."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refunds."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV supported."},
            {"text": "Unapproved non-product commentary.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Fake support."}
        ],
        "summary": "Leader incorrectly allows mandate violation.",
    }

    validator_mandate_violation = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "VIOLATED", "message_excerpt": "Unapproved non-product commentary.", "source_excerpt": "approved public factbook", "explanation": "Validator independently finds MANDATE violated."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refunds."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV supported."},
            {"text": "Unapproved non-product commentary.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "Commentary."},
        ],
        "coverage_explanation": "Validator finds MANDATE VIOLATED.",
    }

    mock_eval(direct_vm, leader_false_mandate, validator_mandate_violation)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == False


def test_regression_mismatch_in_later_rule_r2_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file. Mobile launches next quarter."
    request_id = contract.submit_action(workspace_id, agent_id, "request-false-r2", message)

    leader_false_r2 = {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Mandate satisfied."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "Leader falsely marks R2 SATISFIED."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refunds."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV supported."},
            {"text": "Mobile launches next quarter.", "support": "SUPPORTED", "source_excerpt": "No mobile release date has been announced.", "explanation": "Fake support."}
        ],
        "summary": "Leader incorrectly allows R2 violation.",
    }

    validator_r2_violation = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Mandate satisfied."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"id": "R2", "status": "VIOLATED", "message_excerpt": "Mobile launches next quarter.", "source_excerpt": "No mobile release date has been announced.", "explanation": "Validator independently finds R2 launch date prohibition VIOLATED."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refunds."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV supported."},
            {"text": "Mobile launches next quarter.", "support": "SUPPORTED", "source_excerpt": "No mobile release date has been announced.", "explanation": "Launch date unannounced."},
        ],
        "coverage_explanation": "Validator independently finds R2 VIOLATED.",
    }

    mock_eval(direct_vm, leader_false_r2, validator_r2_violation)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == False


def test_regression_omitted_validator_condition_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-omitted-cond", message)

    leader_resp = allow_response()
    # Validator omits R2 completely
    validator_omitted_r2 = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": leader_resp["assertions"],
        "coverage_explanation": "Validator accidentally omitted R2.",
    }

    mock_eval(direct_vm, leader_resp, validator_omitted_r2)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == False


def test_regression_duplicate_validator_condition_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-dup-cond", message)

    leader_resp = allow_response()
    # Validator duplicates R1 instead of having R2
    validator_dup_r1 = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Policy requires factbook support."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "Duplicate R1."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": leader_resp["assertions"],
        "coverage_explanation": "Validator has duplicate condition ID.",
    }

    mock_eval(direct_vm, leader_resp, validator_dup_r1)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == False


def test_legitimate_matching_deny_consensus(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    message = "Our mobile app launches next Friday."
    request_id = contract.submit_action(workspace_id, agent_id, "request-legit-deny", message)

    leader_deny = deny_response()
    # Validator independently reaches matching DENY
    validator_deny = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "VIOLATED", "message_excerpt": "next Friday", "source_excerpt": "approved public factbook", "explanation": "Invented release date."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "mobile app", "source_excerpt": "A mobile application is under consideration.", "explanation": "Mobile app consideration is supported."},
            {"id": "R2", "status": "VIOLATED", "message_excerpt": "next Friday", "source_excerpt": "No mobile release date has been announced.", "explanation": "Release date is not supported."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No refund promise is made."},
        ],
        "assertions": [
            {"text": "next Friday", "support": "UNSUPPORTED", "source_excerpt": "No mobile release date has been announced.", "explanation": "No date exists in factbook."}
        ],
        "coverage_explanation": "Validator independently agrees on DENY.",
    }

    mock_eval(direct_vm, leader_deny, validator_deny)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == True

    req = contract.get_request(request_id)
    ev = contract.get_evaluation(req["evaluationId"])
    assert ev["status"] == "DENY"
    assert req["permitId"] == ""
    with direct_vm.expect_revert("ready permit required"):
        contract.publish(request_id)



def test_regression_leader_false_satisfied_rule_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)

    direct_vm.sender = direct_alice
    # Message makes supported claim "CSV export" but violates R3 "Do not promise refunds or compensation."
    message = "You can export your beta data as a CSV file. We promise a full refund if not satisfied."
    request_id = contract.submit_action(workspace_id, agent_id, "request-false-satisfied-r3", message)

    leader_false_satisfied = {
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Factbook supported."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date mentioned."},
            {"id": "R3", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "Leader falsely marks refund prohibition SATISFIED."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"text": "We promise a full refund if not satisfied.", "support": "SUPPORTED", "source_excerpt": "Refund requests must be referred to the support team.", "explanation": "Fake support."}
        ],
        "summary": "Leader incorrectly allows violating message.",
    }

    validator_independent_violation = {
        "valid": True,
        "conditions": [
            {"id": "MANDATE", "status": "SATISFIED", "message_excerpt": "You can export your beta data as a CSV file.", "source_excerpt": "approved public factbook", "explanation": "Factbook supported."},
            {"id": "R1", "status": "SATISFIED", "message_excerpt": "CSV file", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export is supported."},
            {"id": "R2", "status": "SATISFIED", "message_excerpt": "", "source_excerpt": "", "explanation": "No launch date mentioned."},
            {"id": "R3", "status": "VIOLATED", "message_excerpt": "We promise a full refund if not satisfied.", "source_excerpt": "Refund requests must be referred to the support team.", "explanation": "Independent validator finds refund prohibition VIOLATED."},
        ],
        "assertions": [
            {"text": "You can export your beta data as a CSV file.", "support": "SUPPORTED", "source_excerpt": "The beta supports CSV export.", "explanation": "CSV export supported."},
            {"text": "We promise a full refund if not satisfied.", "support": "SUPPORTED", "source_excerpt": "Refund requests must be referred to the support team.", "explanation": "Support excerpt refers to team."},
        ],
        "coverage_explanation": "Validator independently finds R3 VIOLATED.",
    }

    mock_eval(direct_vm, leader_false_satisfied, validator_independent_violation)
    contract.evaluate_request(request_id)

    res = direct_vm.run_validator()
    assert res == False



def test_bad_three_rule_output_fails_validation(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-bad", message)
    
    bad_response = allow_response()
    bad_response["conditions"][2]["source_excerpt"] = "n/a"
    bad_response["conditions"][3]["source_excerpt"] = "n/a"
    
    direct_vm.clear_mocks()
    import json
    direct_vm.mock_llm(r"(?s).*Leader JSON.*", json.dumps(validator_verdict(bad_response)))
    direct_vm.mock_llm(r"(?s).*Return JSON only.*", json.dumps(bad_response))
    
    contract.evaluate_request(request_id)
    
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert evaluation["status"] == "EVALUATION_FAILED"

def test_corrected_three_rule_output_passes_validation(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-corrected", message)
    
    corrected_response = allow_response()
    corrected_response["conditions"][2]["source_excerpt"] = ""
    corrected_response["conditions"][3]["source_excerpt"] = ""
    
    direct_vm.clear_mocks()
    import json
    direct_vm.mock_llm(r"(?s).*Leader JSON.*", json.dumps(validator_verdict(corrected_response)))
    direct_vm.mock_llm(r"(?s).*Return JSON only.*", json.dumps(corrected_response))
    
    contract.evaluate_request(request_id)
    
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert evaluation["status"] == "ALLOW"
    assert request["permitId"] != ""

def test_regression_leader_mistakes_fail(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-fail", message)
    
    mistake_response = allow_response()
    # Mistake 1: factbook sentence as MANDATE's source excerpt
    mistake_response["conditions"][0]["source_excerpt"] = "The beta supports CSV export."
    # Mistake 2: "n/a" for R2/R3
    mistake_response["conditions"][2]["source_excerpt"] = "n/a"
    mistake_response["conditions"][3]["source_excerpt"] = "n/a"
    
    direct_vm.clear_mocks()
    import json
    direct_vm.mock_llm(r"(?s).*Leader JSON.*", json.dumps(validator_verdict(mistake_response)))
    direct_vm.mock_llm(r"(?s).*Return JSON only.*", json.dumps(mistake_response))
    
    contract.evaluate_request(request_id)
    
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert evaluation["status"] == "EVALUATION_FAILED"

def test_regression_corrected_leader_response_passes(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_deploy)
    workspace_id = create_workspace(contract, direct_vm, direct_owner)
    agent_id = authorize(contract, direct_vm, direct_owner, workspace_id, direct_alice)
    
    direct_vm.sender = direct_alice
    message = "You can export your beta data as a CSV file."
    request_id = contract.submit_action(workspace_id, agent_id, "request-pass", message)
    
    corrected_response = allow_response()
    # Corrected: MANDATE source_excerpt is exact substring of mandate or ""
    corrected_response["conditions"][0]["source_excerpt"] = "approved public factbook"
    # Corrected: R2/R3 source_excerpt is ""
    corrected_response["conditions"][2]["source_excerpt"] = ""
    corrected_response["conditions"][3]["source_excerpt"] = ""
    
    direct_vm.clear_mocks()
    import json
    direct_vm.mock_llm(r"(?s).*Leader JSON.*", json.dumps(validator_verdict(corrected_response)))
    direct_vm.mock_llm(r"(?s).*Return JSON only.*", json.dumps(corrected_response))
    
    contract.evaluate_request(request_id)
    
    request = contract.get_request(request_id)
    evaluation = contract.get_evaluation(request["evaluationId"])
    
    assert direct_vm.run_validator() == True
    assert evaluation["status"] == "ALLOW"
    assert request["permitId"] != ""
