
import os
from gltest.direct import loader

def _inject_message_to_fd0_pipe(vm):
    import sys
    try:
        from genlayer.calldata import encode
        from genlayer.types import Address
    except ImportError:
        # If testing with new runner, it would be genlayer.py
        try:
            from genlayer.py.calldata import encode
            from genlayer.py.types import Address
        except ImportError:
            return

    sender_addr = Address(vm.sender) if isinstance(vm.sender, bytes) else vm.sender
    contract_addr = Address(vm._contract_address) if isinstance(vm._contract_address, bytes) else vm._contract_address
    origin_addr = Address(vm.origin) if isinstance(vm.origin, bytes) else vm.origin
    encoded = encode(
        {
            'contract_address': contract_addr,
            'sender_address': sender_addr,
            'origin_address': origin_addr,
            'stack': [],
            'value': vm._value,
            'datetime': vm._datetime,
            'is_init': False,
            'chain_id': vm._chain_id,
            'entry_kind': 0,
            'entry_data': b'',
            'entry_stage_data': None,
        }
    )

    read_fd, write_fd = os.pipe()
    try:
        os.write(write_fd, encoded)
    finally:
        os.close(write_fd)
    vm._original_stdin_fd = os.dup(0)
    os.dup2(read_fd, 0)
    os.close(read_fd)

loader._inject_message_to_fd0 = _inject_message_to_fd0_pipe

# Pin compatible genvm runner release version to guarantee fresh-environment reproducibility
import gltest.direct.sdk_loader as sdk_loader
import subprocess
import shutil
import re
import urllib.request
import tempfile
from pathlib import Path

COMPATIBLE_SDK_VERSION = os.environ.get("GLTEST_SDK_VERSION", "v0.6.0-rc8")
GENVM_MANAGER_URL = "https://github.com/genlayerlabs/genvm-manager/releases"

_orig_download_artifacts = sdk_loader.download_artifacts

def custom_download_artifacts(version: str) -> Path:
    sdk_loader.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tarball_name = f"genvm-universal-{version}.tar.xz"
    tarball_path = sdk_loader.CACHE_DIR / tarball_name

    if tarball_path.exists():
        return tarball_path

    manager_url = f"{GENVM_MANAGER_URL}/download/{version}/genvm-universal.tar.xz"
    try:
        req = urllib.request.Request(manager_url, headers={"User-Agent": "gltest-direct"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            with tempfile.NamedTemporaryFile(delete=False, dir=sdk_loader.CACHE_DIR) as tmp:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    tmp.write(chunk)
                tmp_path = tmp.name
        os.replace(tmp_path, tarball_path)
        return tarball_path
    except Exception:
        return _orig_download_artifacts(version)

sdk_loader.download_artifacts = custom_download_artifacts

_orig_setup_sdk_paths = sdk_loader.setup_sdk_paths
_orig_extract_runner = sdk_loader.extract_runner

def custom_extract_runner(
    tarball_path: Path,
    runner_type: str,
    runner_hash: str | None = None,
    version: str | None = None,
) -> Path:
    if version is None:
        match = re.search(r"genvm-universal-(.+)\.tar\.xz", tarball_path.name)
        version = match.group(1) if match else "unknown"

    extract_base = sdk_loader.CACHE_DIR / "extracted" / version / runner_type

    if runner_hash and runner_hash.lower() != "latest":
        extract_dir = extract_base / runner_hash
        if extract_dir.exists():
            return extract_dir

        extract_dir.mkdir(parents=True, exist_ok=True)
        tar_cmd = shutil.which("tar") or shutil.which("tar.exe") or "tar"
        for ext in (".zip", ".tar"):
            inner_name = f"runners/{runner_type}/{runner_hash[:2]}/{runner_hash[2:]}{ext}"
            temp_dir = extract_dir / "_temp_extract"
            temp_dir.mkdir(parents=True, exist_ok=True)
            try:
                res = subprocess.run(
                    [tar_cmd, "-xf", str(tarball_path), "-C", str(temp_dir), inner_name],
                    capture_output=True,
                )
                extracted_archive = temp_dir / inner_name
                if res.returncode == 0 and extracted_archive.exists():
                    if ext == ".zip":
                        import zipfile
                        with zipfile.ZipFile(extracted_archive, "r") as zf:
                            zf.extractall(extract_dir)
                    else:
                        subprocess.run(
                            [tar_cmd, "-xf", str(extracted_archive), "-C", str(extract_dir)],
                            capture_output=True,
                        )
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    return extract_dir
            except Exception:
                pass
            finally:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir, ignore_errors=True)

    return _orig_extract_runner(tarball_path, runner_type, runner_hash, version)

def custom_setup_sdk_paths(contract_path=None, version=None):
    if version is None:
        version = COMPATIBLE_SDK_VERSION
    return _orig_setup_sdk_paths(contract_path, version=version)

sdk_loader.extract_runner = custom_extract_runner
sdk_loader.setup_sdk_paths = custom_setup_sdk_paths

import pytest

@pytest.fixture
def direct_deploy(direct_vm):
    from gltest.direct.loader import deploy_contract
    from pathlib import Path

    def _deploy(
        contract_path: str,
        *args,
        sdk_version: str | None = None,
        **kwargs,
    ):
        if sdk_version is None:
            sdk_version = COMPATIBLE_SDK_VERSION
        path = Path(contract_path)
        if not path.is_absolute():
            if path.exists():
                path = path.resolve()
            else:
                for base in [
                    Path.cwd(),
                    Path.cwd() / "contracts",
                    Path.cwd() / "intelligent-contracts",
                ]:
                    candidate = base / contract_path
                    if candidate.exists():
                        path = candidate.resolve()
                        break
        return deploy_contract(path, direct_vm, *args, sdk_version=sdk_version, **kwargs)

    return _deploy

@pytest.fixture(autouse=True)
def print_contract_attrs():
    yield


def custom_allocate_contract(contract_cls, vm, *args, **kwargs):
    from gltest.direct.loader import _allocate_contract
    try:
        from genlayer.storage._internal.generate import _known_descs, ROOT_SLOT_ID
        td = _known_descs.get(contract_cls)
        if td is not None:
            slot = vm._storage.get_store_slot(ROOT_SLOT_ID)
            instance = td.get(slot, 0)
            # Find and call original __init__
            from genlayer.storage._internal.generate import ORIGINAL_INIT_ATTR
            init = getattr(contract_cls, '__init__', None)
            if hasattr(init, ORIGINAL_INIT_ATTR):
                init = getattr(init, ORIGINAL_INIT_ATTR)
            if init is not None:
                init(instance, *args, **kwargs)
            return instance
    except ImportError:
        pass
    
    return _allocate_contract(contract_cls, vm, *args, **kwargs)

loader._allocate_contract = custom_allocate_contract


def custom_refresh_gl_message(self):
    import sys
    # For old SDK (v0.2.16)
    if 'genlayer' in sys.modules and 'genlayer.message' in sys.modules:
        try:
            from genlayer.py.types import Address
        except ImportError:
            try:
                from genlayer.types import Address
            except ImportError:
                return
        
        sender = self._sender
        if isinstance(sender, bytes):
            sender = Address(sender)
        
        sys.modules['genlayer.message'].sender_address = sender
        sys.modules['genlayer'].message.sender_address = sender

from gltest.direct.vm import VMContext
VMContext._refresh_gl_message = custom_refresh_gl_message


def custom_patch_run_nondet_for_direct_mode():
    from gltest.direct.loader import _validate_pickling
    try:
        import genlayer.vm as gl_vm
    except ImportError:
        try:
            import genlayer.gl.vm as gl_vm
        except ImportError:
            return

    if getattr(gl_vm, '_direct_mode_patched', False):
        return

    def _direct_run_nondet(leader_fn, validator_fn, /, **kwargs):
        from gltest.direct import wasi_mock
        vm = wasi_mock.get_vm()
        if vm._check_pickling:
            _validate_pickling(leader_fn, 'leader_fn')
            _validate_pickling(validator_fn, 'validator_fn')
        result = leader_fn()
        vm._captured_validators.append((result, leader_fn, validator_fn))
        return result

    gl_vm.run_nondet = _direct_run_nondet
    gl_vm._direct_mode_patched = True

import gltest.direct.loader
gltest.direct.loader._patch_run_nondet_for_direct_mode = custom_patch_run_nondet_for_direct_mode

def patch_wasi_mock_gl_call():
    from gltest.direct import wasi_mock
    original_gl_call = wasi_mock.gl_call
    def custom_gl_call(data: bytes, /) -> int:
        vm = wasi_mock.get_vm()
        _local = wasi_mock._local
        fd_buffers = getattr(_local, 'fd_buffers', {})

        try:
            try:
                from genlayer.py import calldata
            except ImportError:
                from genlayer import calldata
            request = calldata.decode(data)
        except Exception as e:
            vm._trace(f"gl_call decode error: {e}")
            return 2**32 - 1

        response = wasi_mock._handle_gl_call(vm, request)

        if response is None:
            return 2**32 - 1

        if isinstance(response, bytes):
            encoded = response
        else:
            try:
                try:
                    from genlayer.py import calldata
                except ImportError:
                    from genlayer import calldata
                encoded = calldata.encode(response)
            except Exception as e:
                vm._trace(f"gl_call encode error: {e}")
                return 2**32 - 1

        import io
        fd_counter = getattr(_local, 'fd_counter', 100)
        fd = fd_counter
        _local.fd_counter = fd_counter + 1

        buf = io.BytesIO(encoded)
        fd_buffers[fd] = buf
        _local.fd_buffers = fd_buffers
        return fd
    wasi_mock.gl_call = custom_gl_call

    original_handle_llm = wasi_mock._handle_llm_request
    def custom_handle_llm(vm, data):
        prompt = data.get("prompt", "")
        response = vm._match_llm_mock(prompt)
        if response is not None:
            return {"ok": response}
        return original_handle_llm(vm, data)
    wasi_mock._handle_llm_request = custom_handle_llm

patch_wasi_mock_gl_call()


def custom_run_validator(
    self,
    *,
    leader_result = None,
    leader_error = None,
    index: int = -1,
) -> bool:
    if not self._captured_validators:
        raise RuntimeError('No validator captured.')

    stored_result, leader_fn, validator_fn = self._captured_validators[index]

    try:
        import genlayer.vm as gl_vm
    except ImportError:
        try:
            import genlayer.gl.vm as gl_vm
        except ImportError:
            raise

    # For old SDK, gl_vm.UserError might be genlayer.vm.Rollback
    UserError = getattr(gl_vm, 'UserError', Exception)

    if leader_error is not None:
        return validator_fn(lambda: (_ for _ in ()).throw(leader_error))
    
    res = leader_result if leader_result is not None else stored_result
    ret = gl_vm.Return(calldata=res)
    return validator_fn(ret)

VMContext.run_validator = custom_run_validator

