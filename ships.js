
var shipBuilds = {
    'Regulation Hauler': ''
};

function GetShipBuild(name)
{
    if (shipBuilds.includes(name))
        return shipBuilds[name];
    return null;
}