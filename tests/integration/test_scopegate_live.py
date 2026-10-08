import os
import pytest


pytestmark = pytest.mark.skipif(
    not os.environ.get("SCOPEGATE_DEPLOYED_ADDRESS"),
    reason="Set SCOPEGATE_DEPLOYED_ADDRESS after deploying contracts/scopegate.py to Studio-dev.",
)


def test_live_read_smoke(genlayer_client):
    address = os.environ["SCOPEGATE_DEPLOYED_ADDRESS"]
    ids = genlayer_client.read_contract(address=address, function_name="list_workspaces", args=[0, 10])
    assert isinstance(ids, list)
