function requirePermission(permCode) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    // Super Admin has unrestricted bypass
    if (req.user.role_id === 1 || req.user.permissions.includes('ALL_SHOWROOMS') && req.user.permissions.includes(permCode)) {
      return next();
    }

    if (req.user.permissions.includes(permCode)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Access denied. Requires permission: ${permCode}`
    });
  };
}

function getEffectiveShowroomId(req) {
  // If user has cross-showroom access permission or is Super Admin
  const canAccessAll = req.user.role_id === 1 || req.user.permissions.includes('ALL_SHOWROOMS') || req.user.showroom_id === null;

  if (canAccessAll) {
    const requestedId = req.query.showroom_id || req.body.showroom_id;
    return requestedId ? parseInt(requestedId, 10) : null; // null means all showrooms
  }

  // Otherwise strictly lock to user's assigned showroom
  return req.user.showroom_id;
}

module.exports = {
  requirePermission,
  getEffectiveShowroomId
};
