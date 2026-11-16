$ErrorActionPreference = 'Stop'
$repository = 'zhinii/bnta-shadow-puppet-studio'
gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Sign in using gh auth login, then retry.' }
gh api "repos/$repository/pages" --silent 2>$null
if ($LASTEXITCODE -eq 0) {
    gh api --method PUT "repos/$repository/pages" -f build_type=workflow --silent
} else {
    gh api --method POST "repos/$repository/pages" -f build_type=workflow --silent
}
if ($LASTEXITCODE -ne 0) { throw 'Could not enable Pages. Choose GitHub Actions in repository Settings > Pages.' }
gh workflow run pages.yml --repo $repository --ref main
if ($LASTEXITCODE -ne 0) { throw 'Pages is enabled; start Publish studio in the Actions tab.' }
Write-Output 'Pages deployment started. Check the Publish studio workflow for its final URL.'
