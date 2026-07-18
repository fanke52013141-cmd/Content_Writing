function Convert-HexToBytes([string] $Hex, [int] $ExpectedByteCount) {
  if ($Hex.Length -ne ($ExpectedByteCount * 2) -or $Hex -notmatch '^[0-9a-fA-F]+$') {
    throw "Expected $ExpectedByteCount bytes encoded as hexadecimal."
  }
  $bytes = New-Object byte[] $ExpectedByteCount
  for ($index = 0; $index -lt $ExpectedByteCount; $index += 1) {
    $bytes[$index] = [Convert]::ToByte($Hex.Substring($index * 2, 2), 16)
  }
  return $bytes
}

function Test-ByteEquality([byte[]] $Left, [byte[]] $Right) {
  if ($Left.Length -ne $Right.Length) { return $false }
  $difference = 0
  for ($index = 0; $index -lt $Left.Length; $index += 1) {
    $difference = $difference -bor ($Left[$index] -bxor $Right[$index])
  }
  return $difference -eq 0
}

function Protect-Backup([string] $InputFile, [string] $OutputFile, [string] $KeyHex) {
  $allKeyBytes = Convert-HexToBytes -Hex $KeyHex -ExpectedByteCount 64
  $encryptionKey = $allKeyBytes[0..31]
  $macKey = $allKeyBytes[32..63]
  $iv = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($iv)
  $aes = [System.Security.Cryptography.Aes]::Create()
  try {
    $aes.Key = $encryptionKey
    $aes.IV = $iv
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $plain = [System.IO.File]::ReadAllBytes($InputFile)
    $cipher = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)
  } finally {
    $aes.Dispose()
  }
  $magic = [System.Text.Encoding]::ASCII.GetBytes('CWBACKUP1')
  $authenticated = $magic + $iv + $cipher
  $hmac = [System.Security.Cryptography.HMACSHA256]::new($macKey)
  try { $tag = $hmac.ComputeHash($authenticated) } finally { $hmac.Dispose() }
  [System.IO.File]::WriteAllBytes($OutputFile, ($magic + $iv + $tag + $cipher))
}

function Unprotect-Backup([string] $InputFile, [string] $OutputFile, [string] $KeyHex) {
  $allKeyBytes = Convert-HexToBytes -Hex $KeyHex -ExpectedByteCount 64
  $bytes = [System.IO.File]::ReadAllBytes($InputFile)
  if ($bytes.Length -lt 58) { throw 'The backup file is truncated.' }
  $magic = $bytes[0..8]
  if ([System.Text.Encoding]::ASCII.GetString($magic) -ne 'CWBACKUP1') {
    throw 'The backup file format is not recognized.'
  }
  $iv = $bytes[9..24]
  $tag = $bytes[25..56]
  $cipher = $bytes[57..($bytes.Length - 1)]
  $macKey = $allKeyBytes[32..63]
  $hmac = [System.Security.Cryptography.HMACSHA256]::new($macKey)
  try { $expectedTag = $hmac.ComputeHash($magic + $iv + $cipher) } finally { $hmac.Dispose() }
  if (-not (Test-ByteEquality -Left $tag -Right $expectedTag)) {
    throw 'Backup authentication failed. The file or encryption key is incorrect.'
  }

  $aes = [System.Security.Cryptography.Aes]::Create()
  try {
    $aes.Key = $allKeyBytes[0..31]
    $aes.IV = $iv
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $plain = $aes.CreateDecryptor().TransformFinalBlock($cipher, 0, $cipher.Length)
  } finally {
    $aes.Dispose()
  }
  [System.IO.File]::WriteAllBytes($OutputFile, $plain)
}
